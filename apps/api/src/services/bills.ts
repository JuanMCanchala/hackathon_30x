/**
 * Intake and decision of bills. Reading and line matching are slow and run outside the lock; the
 * bill, its first decision and anything that decision pays are written inside it, atomically.
 */
import { eq } from 'drizzle-orm';
import {
  activeContract,
  decide,
  resolveVendor,
  type BillStatus,
  type Decision,
} from '@recibido/domain';
import type { Executor } from '../db/client';
import { bills, documents, messages } from '../db/schema';
import { documentText, sha256Hex, type DocumentChannel } from '../reading/documents';
import type { MatchResult } from '../reading/matcher';
import { withOrgLock } from './lock';
import {
  addTimeline,
  allContracts,
  allVendors,
  getBill,
  loadDecisionContext,
  newId,
  ORG_ID,
  persistDecision,
  REOPENED,
  ServiceError,
  type Deps,
  type Persisted,
} from './state';

const MIME: Record<DocumentChannel, string> = {
  pdf: 'application/pdf',
  email: 'message/rfc822',
  chat: 'text/plain',
};

export interface IngestInput {
  bytes: Uint8Array;
  filename: string;
  receivedAt: string;
  channel?: 'pdf' | 'email' | 'chat' | 'portal';
  /**
   * The bill this one corrects. Only trusted code sets it: the vendor portal (a reply bound to
   * the bill by its token) or the demo script. A bill saying it corrects another is not enough.
   */
  supersedesBillId?: string;
  datasetId?: string;
  /** the vendor's portal message that brought this document (vendor-loop.ts) */
  vendorMessage?: string;
}

export interface IngestResult {
  billId: string;
  /** the same bytes arrived before: the existing bill, no new decision */
  duplicateDocument: boolean;
  decision: Decision | null;
  portalToken: string | null;
}

async function billBySha(ex: Executor, sha: string) {
  const [bill] = await ex.select().from(bills).where(eq(bills.documentSha, sha));
  return bill ?? null;
}

/** Decides `billId` now and writes the decision. Call inside the lock, on its transaction. */
export async function evaluateIn(
  ex: Executor,
  billId: string,
  now: string,
): Promise<Persisted & { decision: Decision }> {
  const decision = decide(await loadDecisionContext(ex, billId, now));
  return { decision, ...(await persistDecision(ex, billId, decision, now)) };
}

/**
 * Re-decides a bill with what is known now (clock time, evidence, payments), only while it is new
 * or waits on the vendor or on evidence. A paid, held, escalated, resolved or superseded bill is
 * not re-decided here: a person or a correction moves it. Refused with 409 otherwise.
 */
export async function evaluateBill(deps: Deps, billId: string): Promise<Decision> {
  const decision = await decideIfOpen(deps, billId);
  if (!decision) throw new ServiceError(409, 'Esta cuenta no se vuelve a decidir.');
  return decision;
}

/** Like {@link evaluateBill}, but a bill closed in the meantime is skipped (null). */
export async function reevaluateIfOpen(deps: Deps, billId: string): Promise<Decision | null> {
  return decideIfOpen(deps, billId);
}

const DECIDABLE: BillStatus[] = ['RECEIVED', ...REOPENED];

function decideIfOpen(deps: Deps, billId: string): Promise<Decision | null> {
  return withOrgLock(async () => {
    const now = await deps.clock.now();
    return deps.db.transaction(async (tx) => {
      if (!DECIDABLE.includes((await getBill(tx, billId)).status)) return null;
      return (await evaluateIn(tx, billId, now)).decision;
    });
  });
}

export async function ingestDocument(deps: Deps, input: IngestInput): Promise<IngestResult> {
  const sha = sha256Hex(input.bytes);
  const known = await billBySha(deps.db, sha);
  if (known)
    return { billId: known.id, duplicateDocument: true, decision: null, portalToken: null };

  let read: { channel: DocumentChannel; text: string };
  try {
    read = await documentText(input.bytes, input.filename);
  } catch {
    throw new ServiceError(415, 'Formato no soportado: usa PDF, correo (.eml) o texto (.txt).');
  }
  const reading = await deps.reader.read({
    sha256: sha,
    filename: input.filename,
    text: read.text,
    channel: read.channel,
  });
  const bill = reading.reading;
  const vendor = bill ? resolveVendor(bill, await allVendors(deps.db)) : null;
  const contract =
    bill && vendor ? activeContract(vendor, await allContracts(deps.db), bill.issueDate) : null;
  // a correction comes from the vendor of the bill it corrects, or it is not a correction
  if (input.supersedesBillId) {
    const old = await getBill(deps.db, input.supersedesBillId);
    if (old.vendorId && vendor && vendor.id !== old.vendorId)
      throw new ServiceError(409, 'La cuenta adjunta es de otro proveedor.');
  }
  // without a vendor and a contract there is nothing to match; the engine says why
  const match: MatchResult | null =
    bill && contract ? await deps.matcher.match({ lines: bill.lines, contract }) : null;

  return withOrgLock(async () => {
    const now = await deps.clock.now();
    return deps.db.transaction(async (tx) => {
      const raced = await billBySha(tx, sha);
      if (raced)
        return { billId: raced.id, duplicateDocument: true, decision: null, portalToken: null };

      const old = input.supersedesBillId ? await getBill(tx, input.supersedesBillId) : null;
      // re-checked here: a person may have closed the case while the correction was being read
      if (old && !REOPENED.includes(old.status))
        throw new ServiceError(409, 'La cuenta ya no admite correcciones.');

      await tx
        .insert(documents)
        .values({
          sha256: sha,
          orgId: ORG_ID,
          filename: input.filename,
          mime: MIME[read.channel],
          channel: read.channel,
          text: read.text,
          bytes: Buffer.from(input.bytes),
        })
        .onConflictDoNothing();
      const billId = newId('bill');
      await tx.insert(bills).values({
        id: billId,
        orgId: ORG_ID,
        documentSha: sha,
        channel: input.channel ?? read.channel,
        receivedAt: input.receivedAt,
        status: 'RECEIVED',
        reading: bill,
        readingMeta: {
          ...reading.meta,
          error: bill ? null : (reading.error ?? 'sin lectura'),
        },
        matches: match?.matches ?? null,
        matchMeta: match ? { ...match.meta, error: match.error } : null,
        supersedesBillId: old?.id ?? null,
        // the case carries over: what it asked and when, and what it already paid
        chain: [billId, ...(old?.chain ?? [])],
        askedAt: old?.askedAt ?? null,
        casePaidMinor: old?.casePaidMinor ?? 0,
        datasetId: input.datasetId ?? null,
      });
      await addTimeline(tx, now, 'received', billId, `Llega ${input.filename}.`);
      if (old) {
        await tx.update(bills).set({ status: 'SUPERSEDED' }).where(eq(bills.id, old.id));
        await addTimeline(tx, now, 'superseded', old.id, 'Reemplazada por la cuenta corregida.');
      }
      if (input.vendorMessage)
        await tx.insert(messages).values({
          id: newId('msg'),
          orgId: ORG_ID,
          billId: old?.id ?? billId,
          at: now,
          sender: 'vendor',
          body: input.vendorMessage,
          attachmentBillId: billId,
        });
      const { decision, portalToken } = await evaluateIn(tx, billId, now);
      return { billId, duplicateDocument: false, decision, portalToken };
    });
  });
}
