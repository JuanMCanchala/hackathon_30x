/**
 * The vendor loop: the agent asks for what is missing through a portal link bound to the bill;
 * the vendor answers with a message and, optionally, a corrected bill. A reply never changes
 * where money goes: a message about payout details reaches the engine as part of the bill's text,
 * and its vendor.payout check escalates it.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import { formatMoney, STATUS_LABEL, type Decision } from '@recibido/domain';
import type { Executor } from '../db/client';
import { bills, messages, portalTokens } from '../db/schema';
import { evaluateIn, ingestDocument, reevaluateIfOpen } from './bills';
import { withOrgLock } from './lock';
import {
  addTimeline,
  allVendors,
  getBill,
  insertPortalToken,
  lastDecision,
  newId,
  ORG_ID,
  REOPENED,
  ServiceError,
  sha256Hex,
  type BillRow,
  type Deps,
} from './state';

export async function createPortalToken(deps: Deps, billId: string): Promise<string> {
  const bill = await getBill(deps.db, billId);
  if (!bill.vendorId) throw new ServiceError(409, 'La cuenta no tiene un proveedor registrado.');
  return insertPortalToken(deps.db, bill.id, bill.vendorId, await deps.clock.now());
}

/** The bill a token is bound to, followed to the latest correction of its case. */
async function caseOf(ex: Executor, token: string): Promise<BillRow> {
  const [row] = await ex
    .select()
    .from(portalTokens)
    .where(eq(portalTokens.tokenHash, sha256Hex(token)));
  if (!row) throw new ServiceError(404, 'El enlace no es válido.');
  const all = await ex.select().from(bills).where(eq(bills.orgId, ORG_ID));
  const head = all.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(row.billId));
  if (!head || head.vendorId !== row.vendorId)
    throw new ServiceError(404, 'El enlace no es válido.');
  return head;
}

export interface PortalView {
  bill: {
    id: string;
    status: string;
    statusLabel: string;
    invoiceNumber: string | null;
    issueDate: string | null;
    currency: string | null;
    total: string | null;
    receivedAt: string;
  };
  vendor: { name: string; contactName: string };
  messages: { at: string; sender: 'agent' | 'vendor'; body: string }[];
  missing: { description: string; billed: string; evidenced: string; status: string }[];
  askAmount: string | null;
  canReply: boolean;
}

/** What the vendor sees: their bill, our messages and what is missing. Never payout details. */
export async function portalView(deps: Deps, token: string): Promise<PortalView> {
  const bill = await caseOf(deps.db, token);
  const vendor = (await allVendors(deps.db)).find((v) => v.id === bill.vendorId)!;
  const thread = await deps.db
    .select()
    .from(messages)
    .where(inArray(messages.billId, bill.chain))
    .orderBy(asc(messages.seq));
  const decision = await lastDecision(deps.db, bill.id);
  const money = (minor: number) =>
    decision?.currency ? formatMoney(minor, decision.currency) : String(minor);
  return {
    bill: {
      id: bill.id,
      status: bill.status,
      statusLabel: STATUS_LABEL[bill.status as keyof typeof STATUS_LABEL] ?? bill.status,
      invoiceNumber: bill.reading?.invoiceNumber ?? null,
      issueDate: bill.reading?.issueDate ?? null,
      currency: bill.reading?.currency ?? null,
      total: bill.reading?.total ?? null,
      receivedAt: bill.receivedAt,
    },
    vendor: { name: vendor.name, contactName: vendor.contactName },
    messages: thread
      .filter((m): m is typeof m & { sender: 'agent' | 'vendor' } =>
        ['agent', 'vendor'].includes(m.sender),
      )
      .map((m) => ({ at: m.at, sender: m.sender, body: m.body })),
    missing: (decision?.lines ?? [])
      .filter((l) => l.status === 'missing' || l.status === 'partial' || l.status === 'unmatched')
      .map((l) => ({
        description: l.description,
        billed: money(l.billedMinor),
        evidenced: money(l.evidencedMinor),
        status: l.status,
      })),
    askAmount: decision && decision.askMinor > 0 ? money(decision.askMinor) : null,
    canReply: REOPENED.includes(bill.status as never),
  };
}

export interface VendorReply {
  message: string;
  file?: { bytes: Uint8Array; filename: string };
  /** dataset label of the attached bill (demo and eval only) */
  datasetId?: string;
}

/**
 * Stores the vendor's answer and lets the engine decide again: a corrected bill supersedes the
 * one the token is bound to; a message alone re-evaluates that bill with the message in its text.
 */
export async function vendorReply(
  deps: Deps,
  token: string,
  reply: VendorReply,
): Promise<{ billId: string; decision: Decision }> {
  const message = reply.message.trim();
  if (!message && !reply.file)
    throw new ServiceError(400, 'Escribe un mensaje o adjunta la cuenta.');
  const bill = await caseOf(deps.db, token);
  if (!REOPENED.includes(bill.status as never))
    throw new ServiceError(409, 'Este caso ya no espera una respuesta.');

  if (reply.file) {
    const result = await ingestDocument(deps, {
      bytes: reply.file.bytes,
      filename: reply.file.filename,
      receivedAt: await deps.clock.now(),
      channel: 'portal',
      supersedesBillId: bill.id,
      vendorMessage: message || undefined,
      datasetId: reply.datasetId,
    });
    if (result.decision) return { billId: result.billId, decision: result.decision };
    // a file we already had adds nothing: the message alone is the reply
  }

  return withOrgLock(async () => {
    const now = await deps.clock.now();
    return deps.db.transaction(async (tx) => {
      const current = await getBill(tx, bill.id);
      if (!REOPENED.includes(current.status as never))
        throw new ServiceError(409, 'Este caso ya no espera una respuesta.');
      await tx.insert(messages).values({
        id: newId('msg'),
        orgId: ORG_ID,
        billId: bill.id,
        at: now,
        sender: 'vendor',
        body: message,
      });
      await addTimeline(tx, now, 'vendor_reply', bill.id, 'El proveedor responde por el portal.');
      const { decision } = await evaluateIn(tx, bill.id, now);
      return { billId: bill.id, decision };
    });
  });
}

/**
 * Advances the simulated clock to `now` (when given) and re-decides every open ask: the engine's
 * vendor.deadline check escalates the ones the vendor did not answer in time.
 */
export async function expireAsks(
  deps: Deps,
  now?: string,
): Promise<{ billId: string; decision: Decision }[]> {
  if (now) await deps.clock.set(now);
  const open = await deps.db
    .select({ id: bills.id })
    .from(bills)
    .where(inArray(bills.status, REOPENED));
  const out = [];
  for (const { id } of open) {
    const decision = await reevaluateIfOpen(deps, id);
    if (decision) out.push({ billId: id, decision });
  }
  return out;
}
