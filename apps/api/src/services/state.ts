/**
 * The organization's state as the engine sees it, and how a decision is written back. Everything
 * here runs inside the organization lock, on the open transaction it is given.
 *
 * Safety: the only payments created here are the ones a decision asked for (`payNowMinor`) or a
 * person approved (humans.ts), always to the vendor's registered destination.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, max, or } from 'drizzle-orm';
import {
  BUYER_IDS,
  COMPANY,
  CONTRACTS,
  DEMO_START,
  EVIDENCE,
  FX,
  LIVE_PR,
  VENDORS,
} from '@recibido/dataset';
import {
  DEFAULT_POLICY,
  formatMoney,
  normalizeInvoiceNumber,
  planPayment,
  statusForOutcome,
  STATUS_LABEL,
  type BillStatus,
  type Contract,
  type Currency,
  type Decision,
  type DecisionContext,
  type EvidenceItem,
  type HistoryBill,
  type Payment,
  type Vendor,
} from '@recibido/domain';
import type { Db, Executor } from '../db/client';
import {
  bills,
  contracts,
  decisions,
  documents,
  evidenceItems,
  messages,
  orgState,
  payments,
  portalTokens,
  timeline,
  vendors,
} from '../db/schema';
import type { Matcher } from '../reading/matcher';
import type { Reader } from '../reading/reader';

export const ORG_ID = COMPANY.id;
export type BillRow = typeof bills.$inferSelect;

/** Bills a new fact can still move: the engine re-decides them when evidence or time changes. */
export const REOPENED: BillStatus[] = ['AWAITING_VENDOR', 'PART_PAID'];

/** An error a route can show: an HTTP status and a Spanish message. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Simulated time, stored in org_state.now. Business logic never reads Date.now(). */
export interface Clock {
  now(): Promise<string>;
  set(now: string): Promise<void>;
}

export function orgClock(db: Db): Clock {
  return {
    async now() {
      const [row] = await db.select().from(orgState).where(eq(orgState.orgId, ORG_ID));
      return row?.now ?? DEMO_START;
    },
    async set(now) {
      await db
        .insert(orgState)
        .values({ orgId: ORG_ID, now, phase: 'idle' })
        .onConflictDoUpdate({ target: orgState.orgId, set: { now } });
    },
  };
}

export interface Deps {
  db: Db;
  clock: Clock;
  reader: Reader;
  matcher: Matcher;
}

export const newId = (prefix: string) => `${prefix}_${randomUUID()}`;
export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Loads Altamar Labs: vendors, contracts and evidence. With a live GitHub repository configured,
 * the milestone that is merged live during the demo (LIVE_PR) points to that repository and PR.
 */
export async function seedOrganization(
  db: Db,
  github: { repo: string | null; demoPr: number | null } = { repo: null, demoPr: null },
): Promise<void> {
  const repo = github.repo ?? LIVE_PR.repo;
  const number = github.demoPr ?? LIVE_PR.number;
  const liveRef = `${LIVE_PR.repo}#${LIVE_PR.number}`;
  const contractRows = CONTRACTS.map((c) =>
    c.id !== LIVE_PR.contractId
      ? c
      : {
          ...c,
          terms: c.terms.map((t) =>
            t.id === LIVE_PR.termId
              ? { ...t, evidence: { type: 'github_pr' as const, repo, number } }
              : t,
          ),
        },
  );
  const evidenceRows = EVIDENCE.map((e) =>
    e.ref !== liveRef
      ? e
      : {
          ...e,
          id: prEvidenceId(repo, number),
          ref: `${repo}#${number}`,
          url: `https://github.com/${repo}/pull/${number}`,
        },
  );
  await db.transaction(async (tx) => {
    await tx
      .insert(vendors)
      .values(VENDORS.map((v) => ({ id: v.id, orgId: ORG_ID, data: v })))
      .onConflictDoNothing();
    await tx
      .insert(contracts)
      .values(contractRows.map((c) => ({ id: c.id, orgId: ORG_ID, vendorId: c.vendorId, data: c })))
      .onConflictDoNothing();
    await tx
      .insert(evidenceItems)
      .values(
        evidenceRows.map((e) => ({
          id: e.id,
          orgId: ORG_ID,
          vendorId: e.vendorId,
          data: e,
          updatedAt: DEMO_START,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(orgState)
      .values({ orgId: ORG_ID, now: DEMO_START, phase: 'idle' })
      .onConflictDoNothing();
  });
}

/** The evidence id of a PR, the same the dataset fixtures use. */
export const prEvidenceId = (repo: string, number: number) =>
  `gh-${repo.split('/')[1] ?? repo}-${number}`;

export async function allVendors(ex: Executor): Promise<Vendor[]> {
  return (await ex.select().from(vendors).where(eq(vendors.orgId, ORG_ID))).map((r) => r.data);
}

export async function allContracts(ex: Executor): Promise<Contract[]> {
  return (await ex.select().from(contracts).where(eq(contracts.orgId, ORG_ID))).map((r) => r.data);
}

export async function allEvidence(ex: Executor): Promise<EvidenceItem[]> {
  const rows = await ex
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.orgId, ORG_ID))
    .orderBy(asc(evidenceItems.id));
  return rows.map((r) => r.data);
}

/** Payments in creation order (the independent checker needs chronological order). */
export async function allPayments(ex: Executor): Promise<Payment[]> {
  const rows = await ex
    .select()
    .from(payments)
    .where(eq(payments.orgId, ORG_ID))
    .orderBy(asc(payments.seq));
  return rows.map((r) => r.data);
}

export async function getBill(ex: Executor, billId: string): Promise<BillRow> {
  const [bill] = await ex
    .select()
    .from(bills)
    .where(and(eq(bills.orgId, ORG_ID), eq(bills.id, billId)));
  if (!bill) throw new ServiceError(404, 'La cuenta no existe.');
  return bill;
}

export async function lastDecision(ex: Executor, billId: string): Promise<Decision | null> {
  const [row] = await ex
    .select()
    .from(decisions)
    .where(eq(decisions.billId, billId))
    .orderBy(desc(decisions.seq))
    .limit(1);
  return row?.data ?? null;
}

/** Σ of the payments not returned, per bill. */
function paidByBill(rows: Payment[]): Map<string, number> {
  const paid = new Map<string, number>();
  for (const p of rows)
    if (p.status !== 'returned') paid.set(p.billId, (paid.get(p.billId) ?? 0) + p.amountMinor);
  return paid;
}

/** What a case (a bill and every bill it supersedes) has been paid, by the agent and by people. */
export async function casePaid(ex: Executor, chain: string[]): Promise<number> {
  const paid = paidByBill(await allPayments(ex));
  return chain.reduce((s, id) => s + (paid.get(id) ?? 0), 0);
}

const CURRENCIES: Currency[] = ['USD', 'COP', 'MXN', 'BRL'];
const PERIOD_FREE = ['milestone', 'goods'];

/**
 * The text we read ourselves: the document's own text, then every vendor message about this bill
 * (portal replies without a file, or the reply that brought this bill as its file).
 */
async function billText(ex: Executor, bill: BillRow): Promise<string | null> {
  const [doc] = await ex.select().from(documents).where(eq(documents.sha256, bill.documentSha));
  const replies = await ex
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.sender, 'vendor'),
        or(
          eq(messages.attachmentBillId, bill.id),
          and(eq(messages.billId, bill.id), isNull(messages.attachmentBillId)),
        ),
      ),
    )
    .orderBy(asc(messages.seq));
  return [doc?.text, ...replies.map((m) => m.body)].filter(Boolean).join('\n\n') || null;
}

function historyOf(
  bill: BillRow,
  contractList: Contract[],
  paid: Map<string, number>,
): HistoryBill {
  const r = bill.reading;
  const contract = contractList.find((c) => c.id === bill.contractId);
  const periodFree = contract !== undefined && PERIOD_FREE.includes(contract.type);
  const billCurrency = CURRENCIES.find((c) => c === r?.currency?.trim().toUpperCase()) ?? null;
  return {
    billId: bill.id,
    vendorId: bill.vendorId ?? '',
    contractId: bill.contractId,
    invoiceNumberNormalized: r?.invoiceNumber ? normalizeInvoiceNumber(r.invoiceNumber) : null,
    status: bill.status as BillStatus,
    paidMinor: paid.get(bill.id) ?? 0,
    currency: contract?.currency ?? billCurrency,
    periodFrom: (periodFree ? r?.issueDate : r?.periodFrom) ?? null,
    periodTo: (periodFree ? r?.issueDate : r?.periodTo) ?? null,
    termIds: (bill.matches ?? []).flatMap((m) => (m.termId ? [m.termId] : [])),
    chain: bill.chain,
  };
}

/** Everything the engine needs to decide `billId` at `now`, read fresh. Call inside the lock. */
export async function loadDecisionContext(
  ex: Executor,
  billId: string,
  now: string,
): Promise<DecisionContext> {
  const bill = await getBill(ex, billId);
  const contractList = await allContracts(ex);
  const paid = paidByBill(await allPayments(ex));
  const others = await ex.select().from(bills).where(eq(bills.orgId, ORG_ID));
  return {
    now,
    policy: DEFAULT_POLICY,
    fx: FX,
    bill: {
      id: bill.id,
      reading: bill.reading ?? null,
      readingError: bill.reading ? null : (bill.readingMeta?.error ?? 'sin lectura'),
      documentText: await billText(ex, bill),
      knownNonPayoutIds: BUYER_IDS,
      receivedAt: bill.receivedAt,
      channel: bill.channel,
      chain: bill.chain,
    },
    vendors: await allVendors(ex),
    contracts: contractList,
    matches: bill.matches ?? null,
    matchError: bill.matchMeta?.error ?? null,
    evidence: await allEvidence(ex),
    history: others.filter((b) => b.id !== bill.id).map((b) => historyOf(b, contractList, paid)),
    case: {
      paidMinor: bill.chain.reduce((s, id) => s + (paid.get(id) ?? 0), 0),
      askedAt: bill.askedAt,
    },
  };
}

export async function addTimeline(
  ex: Executor,
  at: string,
  kind: string,
  billId: string | null,
  text: string,
): Promise<void> {
  await ex.insert(timeline).values({ orgId: ORG_ID, at, kind, billId, text });
}

/** A random 32-byte token for the vendor portal; only its SHA-256 is stored. */
export async function insertPortalToken(
  ex: Executor,
  billId: string,
  vendorId: string,
  now: string,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await ex
    .insert(portalTokens)
    .values({ tokenHash: sha256Hex(token), orgId: ORG_ID, billId, vendorId, createdAt: now });
  return token;
}

/**
 * Schedules a payment of `amountMinor` of `bill` to the vendor's registered destination. The
 * caller has the authority: an engine decision (`decisionId`) or a person's approval.
 */
export async function createPayment(
  ex: Executor,
  input: {
    bill: BillRow;
    vendorId: string | null;
    contractId: string | null;
    currency: Currency | null;
    amountMinor: number;
    decidedBy: 'agent' | 'person';
    decisionId: string | null;
    now: string;
  },
): Promise<Payment> {
  const { bill, amountMinor, now } = input;
  const vendor = (await allVendors(ex)).find((v) => v.id === input.vendorId);
  const contract = (await allContracts(ex)).find((c) => c.id === input.contractId);
  if (!vendor || !contract || !input.currency)
    throw new ServiceError(
      409,
      'Sin proveedor registrado y contrato vigente no hay a quién pagar.',
    );
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
    throw new ServiceError(409, 'El monto a pagar no es válido.');
  const plan = planPayment({
    amountMinor,
    currency: input.currency,
    issueDate: bill.reading?.issueDate ?? now.slice(0, 10),
    dueDate: bill.reading?.dueDate ?? null,
    contract,
    today: now,
    fx: FX,
  });
  const [last] = await ex
    .select({ seq: max(payments.seq) })
    .from(payments)
    .where(eq(payments.orgId, ORG_ID));
  const seq = (last?.seq ?? 0) + 1;
  const payment: Payment = {
    id: `pay-${String(seq).padStart(4, '0')}`,
    billId: bill.id,
    vendorId: vendor.id,
    contractId: contract.id,
    amountMinor,
    currency: input.currency,
    destination: vendor.payout.destination,
    rail: vendor.payout.rail,
    decidedBy: input.decidedBy,
    decisionId: input.decisionId,
    scheduledFor: plan.payOn,
    executedAt: null,
    status: 'scheduled',
    plan,
    reference: `RCB-${String(seq).padStart(4, '0')}`,
  };
  await ex.insert(payments).values({
    id: payment.id,
    orgId: ORG_ID,
    seq,
    billId: bill.id,
    data: payment,
    status: 'scheduled',
  });
  await addTimeline(
    ex,
    now,
    'payment',
    bill.id,
    `Pago ${payment.reference} programado: ${formatMoney(amountMinor, input.currency)} a ${vendor.payout.display} el ${plan.payOn}.`,
  );
  return payment;
}

export interface Persisted {
  decisionId: string;
  payment: Payment | null;
  /** a new portal link for the vendor when the decision asks them something */
  portalToken: string | null;
}

/**
 * Writes a decision: the receipt, the bill's status, the payment the decision asks for, the
 * case's paid total and, when it asks the vendor something new, the message and a portal link.
 */
export async function persistDecision(
  ex: Executor,
  billId: string,
  decision: Decision,
  now: string,
): Promise<Persisted> {
  const bill = await getBill(ex, billId);
  const [prev] = await ex
    .select({ seq: max(decisions.seq) })
    .from(decisions)
    .where(eq(decisions.billId, billId));
  const seq = (prev?.seq ?? 0) + 1;
  const decisionId = `${billId}:${seq}`;
  await ex.insert(decisions).values({
    id: decisionId,
    orgId: ORG_ID,
    billId,
    seq,
    at: now,
    outcome: decision.outcome,
    data: decision,
  });

  const asks = decision.outcome === 'ASK_VENDOR' || decision.outcome === 'PAY_PART';
  const payment =
    decision.payNowMinor > 0
      ? await createPayment(ex, {
          bill,
          vendorId: decision.vendorId,
          contractId: decision.contractId,
          currency: decision.currency,
          amountMinor: decision.payNowMinor,
          decidedBy: 'agent',
          decisionId,
          now,
        })
      : null;
  const status = statusForOutcome(decision.outcome);
  await ex
    .update(bills)
    .set({
      status,
      vendorId: decision.vendorId,
      contractId: decision.contractId,
      askedAt: bill.askedAt ?? (asks ? now : null),
      casePaidMinor: await casePaid(ex, bill.chain),
    })
    .where(eq(bills.id, billId));
  await addTimeline(ex, now, 'decision', billId, `${STATUS_LABEL[status]}. ${decision.summary}`);

  let portalToken: string | null = null;
  if (asks && decision.vendorMessage && decision.vendorId) {
    const [lastAgent] = await ex
      .select()
      .from(messages)
      .where(and(eq(messages.billId, billId), eq(messages.sender, 'agent')))
      .orderBy(desc(messages.seq))
      .limit(1);
    if (lastAgent?.body !== decision.vendorMessage) {
      await ex.insert(messages).values({
        id: newId('msg'),
        orgId: ORG_ID,
        billId,
        at: now,
        sender: 'agent',
        body: decision.vendorMessage,
      });
      portalToken = await insertPortalToken(ex, billId, decision.vendorId, now);
    }
  }
  return { decisionId, payment, portalToken };
}
