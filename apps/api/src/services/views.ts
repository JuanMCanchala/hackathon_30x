/**
 * Read models for the app. Payout destinations never leave the API: vendors and payments carry
 * only the masked display ("Bre-B · llave 315 ••• 4512").
 */
import { and, asc, desc, eq, or } from 'drizzle-orm';
import { FX } from '@recibido/dataset';
import {
  checkInvariants,
  DEFAULT_POLICY,
  OUTCOME_LABEL,
  scorecard,
  STATUS_LABEL,
  type BillStatus,
  type CheckerBill,
  type CheckerInput,
  type Outcome,
  type Payment,
  type Vendor,
} from '@recibido/domain';
import type { Executor } from '../db/client';
import {
  bills,
  decisions,
  documents,
  humanActions,
  messages,
  orgState,
  timeline,
} from '../db/schema';
import {
  allContracts,
  allEvidence,
  allPayments,
  allVendors,
  ORG_ID,
  REOPENED,
  ServiceError,
  type BillRow,
  signedPortalToken,
  type Deps,
} from './state';

export type PublicVendor = Omit<Vendor, 'payout'> & {
  payout: Omit<Vendor['payout'], 'destination'>;
};
export type PublicPayment = Omit<Payment, 'destination'> & { destinationDisplay: string };

export function publicVendor(v: Vendor): PublicVendor {
  const { destination: _secret, ...payout } = v.payout;
  return { ...v, payout };
}

export function publicPayment(p: Payment, vendors: Vendor[]): PublicPayment {
  const { destination: _secret, ...rest } = p;
  return {
    ...rest,
    destinationDisplay: vendors.find((v) => v.id === p.vendorId)?.payout.display ?? '—',
  };
}

async function allBills(ex: Executor): Promise<BillRow[]> {
  return ex.select().from(bills).where(eq(bills.orgId, ORG_ID)).orderBy(asc(bills.receivedAt));
}

/** The current state in the independent checker's shape. */
export async function checkerInput(ex: Executor): Promise<CheckerInput> {
  const rows = await allBills(ex);
  const decisionRows = await ex
    .select()
    .from(decisions)
    .where(eq(decisions.orgId, ORG_ID))
    .orderBy(asc(decisions.seq));
  const checkerBills: CheckerBill[] = rows.map((b) => ({
    id: b.id,
    vendorId: b.vendorId,
    contractId: b.contractId,
    reading: b.reading ?? null,
    status: b.status,
    chain: b.chain,
    matches: b.matches ?? null,
    decisions: decisionRows
      .filter((d) => d.billId === b.id)
      .map((d) => ({ id: d.id, outcome: d.outcome as Outcome, payNowMinor: d.data.payNowMinor })),
    receivedAt: b.receivedAt,
  }));
  return {
    vendors: await allVendors(ex),
    contracts: await allContracts(ex),
    evidence: await allEvidence(ex),
    payments: await allPayments(ex),
    bills: checkerBills,
    fx: FX,
    policy: DEFAULT_POLICY,
  };
}

/**
 * The clock shown to the audience: the latest moment the demo has reached (the org clock or the
 * newest timeline entry). Tour steps rewind the org clock to their own scripted time (Daniela
 * answers on Oct 6 after the October bills arrived up to Oct 14), and business logic keeps using
 * that step time; the display never goes backwards.
 */
export async function shownNow(ex: Executor, now: string | null): Promise<string | null> {
  const rows = await ex
    .select({ at: timeline.at })
    .from(timeline)
    .where(eq(timeline.orgId, ORG_ID));
  return [now, ...rows.map((r) => r.at)].reduce<string | null>(
    (latest, at) => (at && (!latest || Date.parse(at) > Date.parse(latest)) ? at : latest),
    null,
  );
}

export async function orgNow(ex: Executor) {
  const [row] = await ex.select().from(orgState).where(eq(orgState.orgId, ORG_ID));
  return { now: await shownNow(ex, row?.now ?? null), phase: row?.phase ?? 'idle' };
}

export async function overview(deps: Deps) {
  const { db } = deps;
  const input = await checkerInput(db);
  const msgs = await db.select().from(messages).where(eq(messages.orgId, ORG_ID));
  const actions = await db.select().from(humanActions).where(eq(humanActions.orgId, ORG_ID));
  const card = scorecard({
    ...input,
    messages: msgs.flatMap((m) =>
      m.sender === 'agent' || m.sender === 'vendor' ? [{ billId: m.billId, from: m.sender }] : [],
    ),
    humanActions: actions.map((a) => ({ billId: a.billId })),
  });
  const violations = checkInvariants(input);
  const byStatus = {} as Record<BillStatus, number>;
  for (const status of Object.keys(STATUS_LABEL) as BillStatus[]) byStatus[status] = 0;
  for (const b of input.bills) byStatus[b.status]++;
  const recent = await db
    .select()
    .from(timeline)
    .where(eq(timeline.orgId, ORG_ID))
    .orderBy(desc(timeline.seq))
    .limit(30);
  return {
    clock: await orgNow(db),
    scorecard: card,
    violations,
    byStatus,
    timeline: recent.map(({ orgId: _org, ...t }) => t),
  };
}

export async function billList(deps: Deps) {
  const { db } = deps;
  const vendors = await allVendors(db);
  const decisionRows = await db.select().from(decisions).where(eq(decisions.orgId, ORG_ID));
  const latest = new Map<string, (typeof decisionRows)[number]>();
  for (const d of decisionRows)
    if ((latest.get(d.billId)?.seq ?? 0) < d.seq) latest.set(d.billId, d);
  return (await allBills(db))
    .map((b) => {
      const d = latest.get(b.id)?.data;
      return {
        id: b.id,
        datasetId: b.datasetId,
        receivedAt: b.receivedAt,
        channel: b.channel,
        vendorId: b.vendorId,
        vendorName: vendors.find((v) => v.id === b.vendorId)?.name ?? b.reading?.vendorName ?? null,
        invoiceNumber: b.reading?.invoiceNumber ?? null,
        total: b.reading?.total ?? null,
        currency: b.reading?.currency ?? null,
        status: b.status,
        statusLabel: STATUS_LABEL[b.status],
        outcome: d?.outcome ?? null,
        outcomeLabel: d ? OUTCOME_LABEL[d.outcome] : null,
        summary: d?.summary ?? null,
        // the inline proof bar: what was billed and how much of it the evidence proves
        amounts: d
          ? { currency: d.currency, billedMinor: d.billedMinor, evidencedMinor: d.evidencedMinor }
          : null,
        supersedesBillId: b.supersedesBillId,
        casePaidMinor: b.casePaidMinor,
      };
    })
    .reverse();
}

async function findBill(ex: Executor, idOrDatasetId: string): Promise<BillRow> {
  const [bill] = await ex
    .select()
    .from(bills)
    .where(
      and(
        eq(bills.orgId, ORG_ID),
        or(eq(bills.id, idOrDatasetId), eq(bills.datasetId, idOrDatasetId)),
      ),
    );
  if (!bill) throw new ServiceError(404, 'La cuenta no existe.');
  return bill;
}

/** Everything behind one decision: the receipt. */
export async function billReceipt(deps: Deps, idOrDatasetId: string) {
  const { db } = deps;
  const bill = await findBill(db, idOrDatasetId);
  const vendors = await allVendors(db);
  const vendor = vendors.find((v) => v.id === bill.vendorId);
  const contract = (await allContracts(db)).find((c) => c.id === bill.contractId);
  const history = await db
    .select()
    .from(decisions)
    .where(eq(decisions.billId, bill.id))
    .orderBy(asc(decisions.seq));
  const decision = history.at(-1)?.data ?? null;
  const [doc] = await db
    .select({ filename: documents.filename, channel: documents.channel })
    .from(documents)
    .where(eq(documents.sha256, bill.documentSha));
  const all = await allBills(db);
  const head = all.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(bill.id)) ?? bill;
  const caseIds = head.chain;
  const thread = (await db.select().from(messages).where(eq(messages.orgId, ORG_ID)))
    .filter((m) => caseIds.includes(m.billId))
    .sort((a, b) => a.seq - b.seq);
  const people = (await db.select().from(humanActions).where(eq(humanActions.orgId, ORG_ID)))
    .filter((a) => caseIds.includes(a.billId))
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    bill: {
      id: bill.id,
      datasetId: bill.datasetId,
      status: bill.status,
      statusLabel: STATUS_LABEL[bill.status],
      channel: bill.channel,
      receivedAt: bill.receivedAt,
      document: doc ?? null,
      supersedesBillId: bill.supersedesBillId,
      casePaidMinor: bill.casePaidMinor,
      askedAt: bill.askedAt,
    },
    vendor: vendor ? publicVendor(vendor) : null,
    contract: contract ?? null,
    reading: bill.reading ?? null,
    readingMeta: bill.readingMeta ?? null,
    matches: bill.matches ?? null,
    matchMeta: bill.matchMeta ?? null,
    outcome: decision?.outcome ?? null,
    outcomeLabel: decision ? OUTCOME_LABEL[decision.outcome] : null,
    summary: decision?.summary ?? null,
    counterfactual: decision?.counterfactual ?? [],
    vendorMessage: decision?.vendorMessage ?? null,
    checks: decision?.checks ?? [],
    lines: decision?.lines ?? [],
    amounts: decision
      ? {
          currency: decision.currency,
          billedMinor: decision.billedMinor,
          evidencedMinor: decision.evidencedMinor,
          alreadyPaidMinor: decision.alreadyPaidMinor,
          payNowMinor: decision.payNowMinor,
          askMinor: decision.askMinor,
        }
      : null,
    engineVersion: decision?.engineVersion ?? null,
    decisions: history.map((d) => ({
      id: d.id,
      seq: d.seq,
      at: d.at,
      outcome: d.data.outcome,
      outcomeLabel: OUTCOME_LABEL[d.data.outcome],
      summary: d.data.summary,
      payNowMinor: d.data.payNowMinor,
    })),
    payments: (await allPayments(db))
      .filter((p) => caseIds.includes(p.billId))
      .map((p) => publicPayment(p, vendors)),
    messages: thread.map(({ orgId: _org, ...m }) => m),
    humanActions: people.map(({ orgId: _org, ...a }) => a),
    chain: caseIds.map((id) => {
      const b = all.find((x) => x.id === id);
      return {
        id,
        datasetId: b?.datasetId ?? null,
        status: b?.status ?? null,
        statusLabel: b ? STATUS_LABEL[b.status] : null,
        receivedAt: b?.receivedAt ?? null,
      };
    }),
    headBillId: head.id,
  };
}

export async function vendorsView(deps: Deps) {
  const { db } = deps;
  const contracts = await allContracts(db);
  const rows = await allBills(db);
  const payments = await allPayments(db);
  return (await allVendors(db)).map((v) => ({
    ...publicVendor(v),
    contracts: contracts.filter((c) => c.vendorId === v.id),
    bills: rows.filter((b) => b.vendorId === v.id).length,
    paid: payments
      .filter((p) => p.vendorId === v.id && p.status !== 'returned')
      .reduce<Record<string, number>>((acc, p) => {
        acc[p.currency] = (acc[p.currency] ?? 0) + p.amountMinor;
        return acc;
      }, {}),
  }));
}

/**
 * The simulated inbox: one thread per case. With `portalLinks` (demo mode) every case that waits
 * on the vendor carries the link the agent's e-mail would contain: a signed token for the bill
 * the agent wrote to (stateless, so reading the inbox writes nothing).
 */
export async function conversations(deps: Deps, options: { portalLinks: boolean }) {
  const { db } = deps;
  const vendors = await allVendors(db);
  const rows = await allBills(db);
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.orgId, ORG_ID))
    .orderBy(asc(messages.seq));
  const threads = new Map<string, { head: BillRow; messages: typeof msgs }>();
  for (const m of msgs) {
    const head = rows.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(m.billId));
    if (!head) continue;
    const t = threads.get(head.id) ?? { head, messages: [] };
    t.messages.push(m);
    threads.set(head.id, t);
  }
  const out = [];
  for (const { head, messages: list } of threads.values()) {
    const open = REOPENED.includes(head.status);
    const vendor = vendors.find((v) => v.id === head.vendorId);
    const askedOn = list.findLast((m) => m.sender === 'agent')?.billId;
    out.push({
      billId: head.id,
      datasetId: head.datasetId,
      vendorId: head.vendorId,
      vendorName: vendor?.name ?? null,
      contactName: vendor?.contactName ?? null,
      status: head.status,
      statusLabel: STATUS_LABEL[head.status],
      open,
      lastAt: list.at(-1)!.at,
      messages: list.map(({ orgId: _org, ...m }) => m),
      portalToken:
        options.portalLinks && open && askedOn && deps.portalSecret
          ? signedPortalToken(deps.portalSecret, askedOn)
          : null,
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export async function paymentsView(deps: Deps) {
  const vendors = await allVendors(deps.db);
  return (await allPayments(deps.db)).map((p) => publicPayment(p, vendors));
}
