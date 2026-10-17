/**
 * The second pair of eyes: re-derives, with its own small code, that no payment broke a rule.
 * It must not import the engine, the checks or the evidence math (a test enforces it), so a bug
 * there cannot hide itself here.
 */
import { convertToUsdMinor, formatMoney, parseDecimalToMinor } from './money';
import type { Payment } from './payments';
import { normalizeDestination, normalizeInvoiceNumber, parseHoursToMinutes } from './text';
import type {
  BillStatus,
  Contract,
  ContractTerm,
  Currency,
  EvidenceItem,
  ExtractedBill,
  FxSnapshot,
  LineMatch,
  Outcome,
  Policy,
  Vendor,
} from './types';

export interface CheckerBill {
  id: string;
  vendorId: string | null;
  contractId: string | null;
  reading: ExtractedBill | null;
  status: BillStatus;
  chain: string[];
  matches: LineMatch[] | null;
  decisions: { id: string; outcome: Outcome; payNowMinor: number }[];
  /** when the bill arrived; only the scorecard uses it */
  receivedAt?: string;
}

export interface CheckerInput {
  vendors: Vendor[];
  contracts: Contract[];
  evidence: EvidenceItem[];
  payments: Payment[];
  bills: CheckerBill[];
  fx: FxSnapshot;
  policy: Policy;
}

export type Invariant = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7';

export interface Violation {
  invariant: Invariant;
  billId: string;
  paymentId: string | null;
  detail: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day of an ISO date or datetime; null when malformed or impossible. */
function calendarDay(s: string | null | undefined): string | null {
  const m = s ? DAY.exec(s.slice(0, 10)) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === m[0] ? m[0] : null;
}

const QTY = /^(\d+)(?:\.(\d{1,6}))?$/;
/** Decimal quantity in millionths; null when malformed. */
function millionths(q: string | null | undefined): bigint | null {
  const m = QTY.exec((q ?? '').trim());
  return m ? BigInt(m[1]! + (m[2] ?? '').padEnd(6, '0')) : null;
}

/** Evidence kind and ref that prove a requirement. */
function proof(term: ContractTerm): { kind: EvidenceItem['kind']; ref: string } | null {
  const e = term.evidence;
  if (!e) return null;
  if (e.type === 'time_entries') return { kind: 'time_entry', ref: e.project };
  if (e.type === 'github_pr') return { kind: 'pr_merged', ref: `${e.repo}#${e.number}` };
  if (e.type === 'deliverable') return { kind: 'deliverable_accepted', ref: e.deliverableId };
  if (e.type === 'ticket') return { kind: 'ticket_closed', ref: e.key };
  if (e.type === 'usage_report') return { kind: 'usage_report', ref: e.meter };
  return { kind: 'delivery_confirmed', ref: e.orderId };
}

/** The matched contract term of each bill line (null when unmatched or repeated). */
function termsOf(bill: CheckerBill, contract: Contract): (ContractTerm | null)[] {
  const used = new Set<string>();
  return (bill.reading?.lines ?? []).map((_, i) => {
    const id = bill.matches?.find((m) => m.lineIndex === i)?.termId ?? null;
    const term = contract.terms.find((t) => t.id === id) ?? null;
    if (!term || used.has(term.id)) return null; // a term counts its evidence once
    used.add(term.id);
    return term;
  });
}

/**
 * Independent recomputation of how much of `bill` the evidence proves, in contract minor units,
 * never above the billed total. Unknown or unmatched lines count 0.
 */
export function evidencedAmount(bill: CheckerBill, input: CheckerInput): number {
  const contract = input.contracts.find((c) => c.id === bill.contractId);
  const reading = bill.reading;
  if (!contract || !reading || !bill.vendorId) return 0;
  const cur = contract.currency;
  const billed = parseDecimalToMinor(reading.total, cur) ?? 0;
  const from = calendarDay(reading.periodFrom);
  const to = calendarDay(reading.periodTo);
  const inPeriod = (e: EvidenceItem) => {
    const d = calendarDay(e.occurredAt);
    return !!(from && to && d && from <= d && d <= to);
  };
  const terms = termsOf(bill, contract);
  let sum = 0;
  reading.lines.forEach((line, i) => {
    const term = terms[i];
    const lineBilled = Math.max(0, parseDecimalToMinor(line.amount, cur) ?? 0);
    if (!term) return;
    const need = proof(term);
    if (!need) {
      sum += lineBilled;
      return;
    }
    const periodBound = term.kind === 'hours' || term.kind === 'usage';
    // the vendor's items that prove this term, each id counted once
    const seen = new Set<string>();
    const items = input.evidence.filter((e) => {
      if (e.vendorId !== bill.vendorId || e.kind !== need.kind || e.ref !== need.ref) return false;
      if ((periodBound && !inPeriod(e)) || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    const unit = parseDecimalToMinor(line.unitPrice, cur);
    let proven: number;
    if (term.kind === 'hours') {
      if (need.kind !== 'time_entry' || unit === null || unit < 0) return;
      const billedMinutes = parseHoursToMinutes(line.quantity ?? '') ?? 0;
      const logged = items.reduce((s, e) => s + (e.minutes ?? 0), 0);
      proven = Number((BigInt(Math.min(billedMinutes, logged)) * BigInt(unit)) / 60n);
    } else if (term.kind === 'usage') {
      if (unit === null || unit < 0) return;
      const billedQty = millionths(line.quantity) ?? 0n;
      const reported = items.reduce((s, e) => s + (millionths(e.quantity) ?? 0n), 0n);
      const qty = billedQty < reported ? billedQty : reported;
      proven = Number((qty * BigInt(unit)) / 1_000_000n);
    } else {
      proven = items.length > 0 ? lineBilled : 0;
    }
    sum += Math.min(lineBilled, proven);
  });
  return Math.min(billed, sum);
}

function monthOf(bill: CheckerBill): string | null {
  const r = bill.reading;
  return (calendarDay(r?.periodFrom) ?? calendarDay(r?.issueDate))?.slice(0, 7) ?? null;
}

export function checkInvariants(input: CheckerInput): Violation[] {
  const out: Violation[] = [];
  const flag = (invariant: Invariant, billId: string, paymentId: string | null, detail: string) =>
    out.push({ invariant, billId, paymentId, detail });
  const billOf = (p: Payment) => input.bills.find((b) => b.id === p.billId);
  const contractOf = (b: CheckerBill) => input.contracts.find((c) => c.id === b.contractId);
  const money = (m: number, c: Currency) => (Number.isSafeInteger(m) ? formatMoney(m, c) : `${m}`);

  for (const p of input.payments) {
    const bill = billOf(p);
    const agent = p.decidedBy === 'agent';

    // I6: every amount is a safe integer > 0
    if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0)
      flag('I6', p.billId, p.id, `El pago ${p.id} tiene un monto inválido (${p.amountMinor}).`);

    // I1: the vendor's registered destination, and the vendor of the bill
    const vendor = input.vendors.find((v) => v.id === p.vendorId);
    if (!vendor)
      flag('I1', p.billId, p.id, `El pago ${p.id} va a un proveedor que no está registrado.`);
    else if (
      normalizeDestination(p.destination) !== normalizeDestination(vendor.payout.destination)
    )
      flag(
        'I1',
        p.billId,
        p.id,
        `El pago ${p.id} va a ${p.destination}, no al destino registrado (${vendor.payout.display}).`,
      );
    else if (bill && bill.vendorId !== p.vendorId)
      flag('I1', p.billId, p.id, `El pago ${p.id} va a un proveedor distinto del de la cuenta.`);

    if (!agent) continue;

    // I2: follows a PAY/PAY_PART decision of the same amount
    const decision = bill?.decisions.find((d) => d.id === p.decisionId);
    if (!bill) flag('I2', p.billId, p.id, `El agente pagó ${p.id} sin una cuenta conocida.`);
    else if (!decision || (decision.outcome !== 'PAY' && decision.outcome !== 'PAY_PART'))
      flag('I2', p.billId, p.id, `El agente pagó ${p.id} sin una decisión de pago.`);
    else if (decision.payNowMinor !== p.amountMinor)
      flag(
        'I2',
        p.billId,
        p.id,
        `El agente pagó ${money(p.amountMinor, p.currency)} y la decisión era ${money(decision.payNowMinor, p.currency)}.`,
      );

    // I7: within the automatic payment limit
    let usd: number | null;
    try {
      usd = convertToUsdMinor(p.amountMinor, p.currency, input.fx);
    } catch {
      usd = null;
    }
    if (usd === null || usd > input.policy.autoPayLimitUsdMinor)
      flag(
        'I7',
        p.billId,
        p.id,
        usd === null
          ? `No hay tasa de cambio para comprobar el límite del pago ${p.id}.`
          : `El agente pagó ${formatMoney(usd, 'USD')}, sobre el límite de ${formatMoney(input.policy.autoPayLimitUsdMinor, 'USD')}.`,
      );

    // I4 (prices): every line of the paid bill is a contract term at or below its price
    const contract = bill && contractOf(bill);
    if (bill && contract && bill.reading) {
      const terms = termsOf(bill, contract);
      bill.reading.lines.forEach((line, i) => {
        const term = terms[i];
        if (!term) {
          flag('I4', bill.id, p.id, `La línea ${i + 1} no es un concepto del contrato.`);
          return;
        }
        const fixed = term.kind === 'milestone' || term.kind === 'retainer';
        const price = parseDecimalToMinor(fixed ? line.amount : line.unitPrice, contract.currency);
        if (price === null || price > term.unitPriceMinor)
          flag(
            'I4',
            bill.id,
            p.id,
            `La línea ${i + 1} cobra ${price === null ? 'un precio ilegible' : formatMoney(price, contract.currency)}; el contrato dice ${formatMoney(term.unitPriceMinor, contract.currency)}.`,
          );
      });
    } else if (bill) {
      flag('I4', bill.id, p.id, `El agente pagó ${p.id} sin contrato o sin lectura de la cuenta.`);
    }
  }

  // I3: when the agent pays a bill, everything the agent paid on its chain so far (the bills it
  // corrects, and earlier payments of this bill) ≤ what this bill proves and ≤ what it bills.
  // A later revision never re-judges an earlier payment: each payment is bounded by its own bill.
  const agentPaid = input.payments.filter((p) => p.decidedBy === 'agent');
  agentPaid.forEach((p, index) => {
    const bill = billOf(p);
    if (!bill) return;
    const chain = new Set([bill.id, ...bill.chain]);
    const sum = agentPaid
      .filter((q, i) => chain.has(q.billId) && (q.billId !== bill.id || i <= index))
      .reduce((s, q) => s + q.amountMinor, 0);
    const cur = contractOf(bill)?.currency ?? p.currency;
    const billed = Math.max(0, parseDecimalToMinor(bill.reading?.total, cur) ?? 0);
    const bound = Math.min(billed, evidencedAmount(bill, input));
    if (sum > bound)
      flag(
        'I3',
        bill.id,
        p.id,
        `El agente lleva ${money(sum, cur)} pagados en la cuenta ${bill.id} y lo que la precede; la evidencia prueba ${formatMoney(bound, cur)} de ${formatMoney(billed, cur)} facturados.`,
      );
  });

  // I4 (cap): agent payments per contract and month ≤ the contract's monthly cap
  const byMonth = new Map<string, Payment[]>();
  for (const p of input.payments) {
    const bill = billOf(p);
    const month = bill && monthOf(bill);
    if (p.decidedBy !== 'agent' || !bill?.contractId || !month) continue;
    const key = `${bill.contractId}|${month}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), p]);
  }
  for (const [key, paid] of byMonth) {
    const contract = input.contracts.find((c) => c.id === key.split('|')[0]);
    if (!contract) continue;
    let sum = 0;
    for (const p of paid) {
      sum += p.amountMinor;
      if (sum > contract.periodCapMinor)
        flag(
          'I4',
          p.billId,
          p.id,
          `El agente lleva ${money(sum, contract.currency)} pagados en ${key.split('|')[1]} a ${contract.title}, sobre el tope de ${formatMoney(contract.periodCapMinor, contract.currency)}.`,
        );
    }
  }

  // I5: one invoice number of a vendor is paid on one chain only
  const firstChain = new Map<string, CheckerBill>();
  for (const p of input.payments) {
    const bill = billOf(p);
    const number = bill?.reading?.invoiceNumber?.trim();
    if (!bill || !number) continue;
    const key = `${p.vendorId}|${normalizeInvoiceNumber(number)}`;
    const first = firstChain.get(key);
    if (!first) {
      firstChain.set(key, bill);
      continue;
    }
    const sameChain =
      first.id === bill.id ||
      [first.id, ...first.chain].some((id) => id === bill.id || bill.chain.includes(id));
    if (!sameChain) {
      flag(
        'I5',
        bill.id,
        p.id,
        `La cuenta ${number} ya se pagó en ${first.id} y se volvió a pagar en ${bill.id}.`,
      );
    }
  }

  return out;
}
