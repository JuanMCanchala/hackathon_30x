/**
 * Ingestion and decision of bills (SYSTEM_DESIGN §5). Reading happens before the lock; the
 * decision, its receipt and its ledger entries are written atomically inside it.
 */
import { and, eq } from 'drizzle-orm';
import {
  decide,
  scanForAgentInstructions,
  type Decision,
  type ExtractedInvoice,
  type InvoiceSource,
  type Requester,
} from '@mandato/domain';
import type { ExtractionMeta } from '../db/schema';
import { approvalRequests, decisions, documents, invoices, organizations } from '../db/schema';
import { ALLOWED_MEDIA_TYPES, documentKind, readableTexts } from '../extraction/prepare';
import type { ExtractionOutcome } from '../extraction/types';
import { AppError, newId, sha256 } from '../lib/common';
import { buildDecisionContext } from './context';
import { nowIso, withOrgLock, type Deps } from './deps';
import { appendLedger, SYSTEM_ACTOR, type LedgerAppend } from './ledger';

export interface IngestDocument {
  bytes: Buffer;
  filename: string;
  mediaType: string;
}

export interface IngestRequest {
  orgId: string;
  source: InvoiceSource;
  requester: Requester;
  /** A document to read (PDF, image, e-mail, chat text)… */
  document?: IngestDocument;
  /** …or an already structured request from an external agent. */
  structured?: ExtractedInvoice;
  /** Simulated instant for guided demo months; defaults to the clock. */
  at?: string;
  datasetId?: string | null;
  title?: string | null;
}

export interface IngestResult {
  invoiceId: string;
  ref: string;
  created: boolean;
  outcome: Decision['outcome'];
  summary: string;
}

const EXTENSIONS: Record<string, string> = {
  pdf: '.pdf',
  image: '.img',
  email: '.eml',
  text: '.txt',
};

function actorOf(requester: Requester) {
  if (requester.kind === 'user')
    return { kind: 'user' as const, id: requester.userId, name: requester.name };
  if (requester.kind === 'agent')
    return { kind: 'agent' as const, id: requester.agentId, name: requester.name };
  return { kind: 'system' as const, id: 'intake', name: requester.name };
}

function statusFor(outcome: Decision['outcome']) {
  return outcome === 'PAY' ? 'PAID' : outcome === 'HOLD' ? 'HELD' : 'PENDING_APPROVAL';
}

export async function ingestInvoice(deps: Deps, request: IngestRequest): Promise<IngestResult> {
  const at = nowIso(deps, request.at);
  const { db, config } = deps;

  let doc: {
    sha256: string;
    storagePath: string;
    filename: string;
    mediaType: string;
    size: number;
  } | null = null;
  let outcome: ExtractionOutcome;
  let texts: string[];

  if (request.document) {
    const { bytes, filename, mediaType } = request.document;
    if (bytes.length > config.MAX_UPLOAD_BYTES) {
      throw new AppError(413, 'too_large', 'El archivo supera el tamaño máximo permitido.');
    }
    const kind = documentKind(mediaType, filename);
    if (!kind || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      throw new AppError(
        415,
        'unsupported_media_type',
        'Formato no soportado: usa PDF, imagen, .eml o texto.',
      );
    }
    const hash = sha256(bytes);
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.orgId, request.orgId), eq(documents.sha256, hash)));
    if (existing) {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.documentId, existing.id));
      if (invoice) {
        const [decision] = await db
          .select()
          .from(decisions)
          .where(eq(decisions.invoiceId, invoice.id));
        return {
          invoiceId: invoice.id,
          ref: invoice.ref,
          created: false,
          outcome: invoice.outcome ?? 'ESCALATE',
          summary: decision?.summary ?? '',
        };
      }
    }
    const storagePath = await deps.documents.put(
      request.orgId,
      hash,
      EXTENSIONS[kind] ?? '',
      bytes,
    );
    doc = { sha256: hash, storagePath, filename, mediaType, size: bytes.length };
    // Reading happens outside the organization lock: it is the slow part.
    outcome = await deps.extractor.extract({ bytes, filename, mediaType, sha256: hash });
    texts = await readableTexts(bytes, mediaType, filename);
  } else if (request.structured) {
    outcome = {
      extraction: request.structured,
      error: null,
      meta: { provider: 'agent', model: null, cacheHit: false, latencyMs: 0, error: null },
    };
    texts = [
      request.structured.description ?? '',
      ...request.structured.lineItems.map((i) => i.description),
    ];
  } else {
    throw new AppError(400, 'bad_request', 'Falta el documento o la solicitud estructurada.');
  }

  const scan = scanForAgentInstructions(...texts);
  const meta: ExtractionMeta = { ...outcome.meta, scanPhrases: scan.phrases };
  const actor = actorOf(request.requester);

  const result = await withOrgLock(db, request.orgId, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, request.orgId));
    if (!org) throw new AppError(404, 'not_found', 'La organización no existe.');
    const seq = org.invoiceSeq + 1;
    const ref = `MND-${String(seq).padStart(4, '0')}`;
    await tx.update(organizations).set({ invoiceSeq: seq }).where(eq(organizations.id, org.id));

    let documentId: string | null = null;
    if (doc) {
      documentId = newId('doc');
      await tx.insert(documents).values({
        id: documentId,
        orgId: request.orgId,
        sha256: doc.sha256,
        filename: doc.filename,
        mediaType: doc.mediaType,
        size: doc.size,
        storagePath: doc.storagePath,
        createdAt: new Date(at),
      });
    }

    const context = await buildDecisionContext(tx, {
      orgId: request.orgId,
      now: at,
      extraction: outcome.extraction,
      extractionError: outcome.error,
      source: request.source,
      instructionScan: scan,
      requester: request.requester,
    });
    const decision = decide(context);
    const f = decision.facts;
    const invoiceId = newId('inv');
    const title =
      request.title ??
      [f.payeeName ?? f.issuerName ?? doc?.filename ?? 'Cobro', f.invoiceNumber]
        .filter(Boolean)
        .join(' · ');

    await tx.insert(invoices).values({
      id: invoiceId,
      orgId: request.orgId,
      seq,
      ref,
      documentId,
      source: request.source,
      requester: request.requester,
      datasetId: request.datasetId ?? null,
      title,
      receivedAt: new Date(at),
      extraction: outcome.extraction,
      extractionMeta: meta,
      status: statusFor(decision.outcome),
      outcome: decision.outcome,
      periodKey: f.periodKey,
      payeeId: f.payeeId,
      issuerName: f.issuerName,
      issuerTaxIdNorm: f.issuerTaxIdNorm,
      issuerNameFolded: f.issuerNameFolded,
      destinationNorm: f.destinationNorm,
      invoiceNumber: f.invoiceNumber,
      invoiceNumberNorm: f.invoiceNumberNorm,
      amountMinor: f.amountMinor,
      currency: f.currency,
      usdCents: f.usdCents,
      issueDate: f.issueDate,
      dueDate: f.dueDate,
      servicePeriod: f.servicePeriod,
      decidedAt: new Date(at),
      createdAt: new Date(at),
    });
    const decisionId = newId('dec');
    await tx.insert(decisions).values({
      id: decisionId,
      orgId: request.orgId,
      invoiceId,
      outcome: decision.outcome,
      approvalsRequired: decision.approvalsRequired,
      results: decision.results,
      summary: decision.summary,
      counterfactual: decision.counterfactual,
      facts: decision.facts,
      policyVersion: context.policy.version,
      mandateId: f.mandateId,
      engineVersion: decision.engineVersion,
      decidedAt: new Date(at),
    });

    const entries: LedgerAppend[] = [
      {
        type: 'INVOICE_RECEIVED',
        entityId: invoiceId,
        actor,
        at,
        payload: {
          invoiceId,
          ref,
          source: request.source,
          documentSha256: doc?.sha256 ?? null,
          requestedBy: actor.id,
        },
      },
      {
        type: 'INVOICE_EXTRACTED',
        entityId: invoiceId,
        actor: SYSTEM_ACTOR,
        at,
        payload: {
          invoiceId,
          provider: meta.provider,
          model: meta.model,
          cacheHit: meta.cacheHit,
          ok: outcome.extraction !== null,
          error: outcome.error,
        },
      },
      {
        type: 'DECISION_RECORDED',
        entityId: invoiceId,
        actor: SYSTEM_ACTOR,
        at,
        payload: {
          invoiceId,
          ref,
          outcome: decision.outcome,
          approvalsRequired: decision.approvalsRequired,
          policyVersion: context.policy.version,
          facts: decision.facts,
          results: decision.results.map((r) => ({
            id: r.id,
            status: r.status,
            safeSkip: r.safeSkip,
            onFail: r.onFail,
          })),
          summary: decision.summary,
          counterfactual: decision.counterfactual,
          engineVersion: decision.engineVersion,
        },
      },
    ];
    if (decision.outcome === 'ESCALATE') {
      const requestId = newId('apr');
      await tx.insert(approvalRequests).values({
        id: requestId,
        orgId: request.orgId,
        invoiceId,
        required: decision.approvalsRequired,
        status: 'pending',
        createdAt: new Date(at),
      });
      entries.push({
        type: 'APPROVAL_REQUESTED',
        entityId: invoiceId,
        actor: SYSTEM_ACTOR,
        at,
        payload: { requestId, invoiceId, required: decision.approvalsRequired },
      });
    }
    await appendLedger(tx, request.orgId, entries);
    return { invoiceId, ref, title, decision };
  });

  deps.bus.publish({
    type: 'invoice.decided',
    orgId: request.orgId,
    at,
    data: {
      invoiceId: result.invoiceId,
      ref: result.ref,
      title: result.title,
      outcome: result.decision.outcome,
      summary: result.decision.summary,
      datasetId: request.datasetId ?? null,
    },
  });

  return {
    invoiceId: result.invoiceId,
    ref: result.ref,
    created: true,
    outcome: result.decision.outcome,
    summary: result.decision.summary,
  };
}
