/**
 * A minimal in-memory replay of the script through the pure engine with the reference reading
 * (each bill's `truth` and `truthMatches`). No database, no LLM. The API's eval runs the same
 * script through the real services and can compare its results against this one.
 */
import {
  decide,
  DEFAULT_POLICY,
  normalizeInvoiceNumber,
  planPayment,
  statusForOutcome,
  type BillStatus,
  type CheckerBill,
  type CheckerInput,
  type Contract,
  type Decision,
  type EvidenceItem,
  type FxSnapshot,
  type HistoryBill,
  type Outcome,
  type Payment,
  type Policy,
  type Vendor,
} from '@recibido/domain';
import { BILLS, CONTRACTS, EVIDENCE, FX, VENDORS, type BillSpec, type ScriptStep } from '../src';

export interface ReplayOptions {
  bills?: BillSpec[];
  vendors?: Vendor[];
  contracts?: Contract[];
  evidence?: EvidenceItem[];
  fx?: FxSnapshot;
  policy?: Policy;
}

export interface ReplayBill {
  first: Outcome;
  /** the status the case ends in (for a superseded bill, the status of its latest revision) */
  final: BillStatus;
  /** this bill's own status (SUPERSEDED once a revision replaces it) */
  status: BillStatus;
  decisions: Decision[];
}

export interface ReplayResult {
  bills: Record<string, ReplayBill>;
  /** everything the independent checker needs, in its shape */
  checker: CheckerInput;
}

interface Case {
  askedAt: string | null;
}

interface Rec {
  spec: BillSpec;
  receivedAt: string;
  status: BillStatus;
  chain: string[];
  case: Case;
  messages: string[];
  decisions: Decision[];
  decisionIds: string[];
}

const REOPENED: BillStatus[] = ['AWAITING_VENDOR', 'PART_PAID'];
const PERIOD_FREE = ['milestone', 'goods'];

export function replayScript(steps: ScriptStep[], options: ReplayOptions = {}): ReplayResult {
  const specs = options.bills ?? BILLS;
  const vendors = options.vendors ?? VENDORS;
  const contracts = options.contracts ?? CONTRACTS;
  const fx = options.fx ?? FX;
  const policy = options.policy ?? DEFAULT_POLICY;
  const evidence = [...(options.evidence ?? EVIDENCE)];
  const recs: Rec[] = [];
  const payments: Payment[] = [];

  const spec = (id: string) => {
    const s = specs.find((b) => b.id === id);
    if (!s) throw new Error(`unknown bill ${id}`);
    return s;
  };
  const rec = (id: string) => {
    const r = recs.find((x) => x.spec.id === id);
    if (!r) throw new Error(`bill ${id} has not arrived`);
    return r;
  };
  const paidOn = (billId: string) =>
    payments
      .filter((p) => p.billId === billId && p.status !== 'returned')
      .reduce((s, p) => s + p.amountMinor, 0);
  const last = (r: Rec) => r.decisions.at(-1)!;

  const history = (r: Rec): HistoryBill => {
    const d = last(r);
    const t = r.spec.truth;
    const type = contracts.find((c) => c.id === d.contractId)?.type;
    const periodFree = type !== undefined && PERIOD_FREE.includes(type);
    return {
      billId: r.spec.id,
      vendorId: d.vendorId ?? '',
      contractId: d.contractId,
      invoiceNumberNormalized: t.invoiceNumber ? normalizeInvoiceNumber(t.invoiceNumber) : null,
      status: r.status,
      paidMinor: paidOn(r.spec.id),
      currency: d.currency,
      periodFrom: periodFree ? t.issueDate : t.periodFrom,
      periodTo: periodFree ? t.issueDate : t.periodTo,
      termIds: r.spec.truthMatches.flatMap((m) => (m.termId ? [m.termId] : [])),
      chain: r.chain,
    };
  };

  function pay(r: Rec, amountMinor: number, decidedBy: 'agent' | 'person', now: string) {
    const d = last(r);
    const vendor = vendors.find((v) => v.id === d.vendorId);
    const contract = contracts.find((c) => c.id === d.contractId);
    if (!vendor || !contract || !d.currency) throw new Error(`${r.spec.id}: cannot pay`);
    const plan = planPayment({
      amountMinor,
      currency: d.currency,
      issueDate: r.spec.truth.issueDate!,
      dueDate: r.spec.truth.dueDate,
      contract,
      today: now,
      fx,
    });
    const seq = payments.length + 1;
    payments.push({
      id: `pay-${seq}`,
      billId: r.spec.id,
      vendorId: vendor.id,
      contractId: contract.id,
      amountMinor,
      currency: d.currency,
      destination: vendor.payout.destination,
      rail: vendor.payout.rail,
      decidedBy,
      decisionId: decidedBy === 'agent' ? r.decisionIds.at(-1)! : null,
      scheduledFor: plan.payOn,
      executedAt: null,
      status: 'scheduled',
      plan,
      reference: `RCB-${String(seq).padStart(4, '0')}`,
    });
  }

  function evaluate(r: Rec, now: string) {
    const s = r.spec;
    const documentText = [s.body, ...r.messages].filter(Boolean).join('\n\n') || null;
    const decision = decide({
      now,
      policy,
      fx,
      bill: {
        id: s.id,
        reading: s.truth,
        readingError: null,
        documentText,
        receivedAt: r.receivedAt,
        channel: s.channel,
        chain: r.chain,
      },
      vendors,
      contracts,
      matches: s.truthMatches,
      matchError: null,
      evidence: [...evidence],
      history: recs.filter((x) => x !== r).map(history),
      case: {
        paidMinor: r.chain.reduce((sum, id) => sum + paidOn(id), 0),
        askedAt: r.case.askedAt,
      },
    });
    r.decisions.push(decision);
    r.decisionIds.push(`${s.id}#${r.decisions.length}`);
    r.status = statusForOutcome(decision.outcome);
    if (
      (decision.outcome === 'ASK_VENDOR' || decision.outcome === 'PAY_PART') &&
      r.case.askedAt === null
    )
      r.case.askedAt = now;
    if (decision.payNowMinor > 0) pay(r, decision.payNowMinor, 'agent', now);
  }

  function arrive(billId: string, at: string, supersedes: Rec | null, message: string | null) {
    const s = spec(billId);
    if (recs.some((x) => x.spec.id === billId)) throw new Error(`${billId} arrived twice`);
    const r: Rec = {
      spec: s,
      receivedAt: at,
      status: 'RECEIVED',
      chain: [billId, ...(supersedes?.chain ?? [])],
      case: supersedes?.case ?? { askedAt: null },
      messages: message ? [message] : [],
      decisions: [],
      decisionIds: [],
    };
    if (supersedes) supersedes.status = 'SUPERSEDED';
    recs.push(r);
    evaluate(r, at);
  }

  const reopened = (vendorId?: string) =>
    recs.filter(
      (r) =>
        REOPENED.includes(r.status) && (vendorId === undefined || r.spec.vendorId === vendorId),
    );

  for (const step of steps) {
    switch (step.type) {
      case 'bill':
        arrive(step.billId, step.at, null, null);
        break;
      case 'vendor_reply': {
        const original = rec(step.billId);
        if (step.replyBillId) arrive(step.replyBillId, step.at, original, step.message);
        else {
          original.messages.push(step.message);
          evaluate(original, step.at);
        }
        break;
      }
      case 'evidence': {
        const i = evidence.findIndex((e) => e.id === step.item.id);
        if (i >= 0) evidence[i] = step.item;
        else evidence.push(step.item);
        for (const r of reopened(step.item.vendorId)) evaluate(r, step.at);
        break;
      }
      case 'human': {
        const r = rec(step.billId);
        if (r.status !== 'ESCALATED') throw new Error(`${r.spec.id} is ${r.status}, not escalated`);
        if (step.action === 'approve') {
          const billed = last(r).billedMinor;
          const casePaid = r.chain.reduce((sum, id) => sum + paidOn(id), 0);
          if (billed - casePaid > 0) pay(r, billed - casePaid, 'person', step.at);
          r.status = 'APPROVED';
        } else r.status = 'REJECTED';
        break;
      }
      case 'clock': {
        const day = step.to.slice(0, 10);
        for (const p of payments)
          if (p.status === 'scheduled' && p.scheduledFor <= day) {
            p.status = 'sent';
            p.executedAt = `${p.scheduledFor}T10:00:00-05:00`;
          }
        for (const r of reopened()) evaluate(r, step.to);
        break;
      }
    }
  }

  const head = (r: Rec) =>
    recs.find((x) => x.status !== 'SUPERSEDED' && x.chain.includes(r.spec.id))!;
  const bills: Record<string, ReplayBill> = {};
  for (const r of recs)
    bills[r.spec.id] = {
      first: r.decisions[0]!.outcome,
      final: head(r).status,
      status: r.status,
      decisions: r.decisions,
    };

  const checkerBills: CheckerBill[] = recs.map((r) => ({
    id: r.spec.id,
    vendorId: last(r).vendorId,
    contractId: last(r).contractId,
    reading: r.spec.truth,
    status: r.status,
    chain: r.chain,
    matches: r.spec.truthMatches,
    decisions: r.decisions.map((d, i) => ({
      id: r.decisionIds[i]!,
      outcome: d.outcome,
      payNowMinor: d.payNowMinor,
    })),
    receivedAt: r.receivedAt,
  }));

  return {
    bills,
    checker: { vendors, contracts, evidence, payments, bills: checkerBills, fx, policy },
  };
}
