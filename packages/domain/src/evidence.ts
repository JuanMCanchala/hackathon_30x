import { parseDecimalToMinor } from './money';
import type { Currency } from './money';
import { parseHoursToMinutes } from './text';
import type {
  ContractTerm,
  EvidenceItem,
  EvidenceKind,
  EvidenceRequirement,
  ExtractedBill,
  ExtractedLine,
  LineEvaluation,
} from './types';

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** Compares by the ISO date prefix as written (offsets ignored); a missing bound is open. */
function inPeriod(item: EvidenceItem, from: string | null, to: string | null): boolean {
  const d = DAY.exec(item.occurredAt)?.[0];
  if (!d) return false;
  return (!from || d >= from.slice(0, 10)) && (!to || d <= to.slice(0, 10));
}

/** Evidence kind that closes each requirement, and the ref it must carry. */
function closing(req: EvidenceRequirement): { kind: EvidenceKind; ref: string } {
  switch (req.type) {
    case 'time_entries':
      return { kind: 'time_entry', ref: req.project };
    case 'github_pr':
      return { kind: 'pr_merged', ref: `${req.repo}#${req.number}` };
    case 'deliverable':
      return { kind: 'deliverable_accepted', ref: req.deliverableId };
    case 'ticket':
      return { kind: 'ticket_closed', ref: req.key };
    case 'usage_report':
      return { kind: 'usage_report', ref: req.meter };
    case 'delivery':
      return { kind: 'delivery_confirmed', ref: req.orderId };
  }
}

/** floor(decimal quantity × minor unit price), exact. Null when the quantity is not a decimal. */
function mulFloor(quantity: string, unitMinor: number): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(quantity.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  return Number((BigInt(m[1]! + frac) * BigInt(unitMinor)) / 10n ** BigInt(frac.length));
}

/** Minutes → decimal hours, at most 2 decimals, no trailing zeros ("5550" → "92.5"). */
function hoursString(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const hundredths = Math.floor(((minutes % 60) * 100) / 60);
  if (hundredths === 0) return `${whole}`;
  return `${whole}.${String(hundredths).padStart(2, '0').replace(/0$/, '')}`;
}

function statusOf(evidenced: number, billed: number): LineEvaluation['status'] {
  if (evidenced <= 0) return 'missing';
  return evidenced >= billed ? 'evidenced' : 'partial';
}

/**
 * Per-line evidence math. Unparsable quantity/price/amount count as 0 for that piece (the
 * engine's arithmetic check reports them); everything is integer minor units.
 */
export function evaluateLine(
  line: ExtractedLine,
  lineIndex: number,
  term: ContractTerm | null,
  bill: ExtractedBill,
  currency: Currency,
  evidence: EvidenceItem[],
  vendorId: string,
): LineEvaluation {
  const billedMinor = parseDecimalToMinor(line.amount, currency) ?? 0;
  const base: LineEvaluation = {
    lineIndex,
    description: line.description,
    termId: term?.id ?? null,
    termTitle: term?.title ?? null,
    billedMinor,
    evidencedMinor: 0,
    billedQuantity: line.quantity,
    evidencedQuantity: null,
    status: 'unmatched',
    evidence: [],
    supporting: [],
  };
  if (!term) return base;

  if (!term.evidence) {
    return { ...base, evidencedMinor: billedMinor, status: 'not_required' };
  }

  const { kind, ref } = closing(term.evidence);
  const mine = evidence.filter((e) => e.vendorId === vendorId);
  const counted = mine.filter(
    (e) => e.kind === kind && e.ref === ref && inPeriod(e, bill.periodFrom, bill.periodTo),
  );
  const unitMinor = parseDecimalToMinor(line.unitPrice, currency) ?? 0;

  if (term.kind === 'hours') {
    const billedMinutes = (line.quantity && parseHoursToMinutes(line.quantity)) || 0;
    const logged = counted.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
    const minutes = Math.min(billedMinutes, logged);
    const evidencedMinor = Math.min(billedMinor, Number((BigInt(minutes) * BigInt(unitMinor)) / 60n));
    return {
      ...base,
      evidencedMinor,
      evidencedQuantity: hoursString(minutes),
      status: statusOf(minutes, billedMinutes),
      evidence: counted,
      supporting: mine.filter(
        (e) => e.kind === 'pr_merged' && inPeriod(e, bill.periodFrom, bill.periodTo),
      ),
    };
  }

  if (term.kind === 'usage') {
    const billedQty = Number(line.quantity ?? NaN);
    const reported = counted.reduce((sum, e) => sum + Number(e.quantity ?? 0), 0);
    const qty = Number.isFinite(billedQty) ? Math.min(billedQty, reported) : 0;
    const evidencedMinor = Math.min(billedMinor, mulFloor(String(qty), unitMinor) ?? 0);
    return {
      ...base,
      evidencedMinor,
      evidencedQuantity: String(qty),
      status: statusOf(evidencedMinor, billedMinor),
      evidence: counted,
    };
  }

  // milestone / goods / retainer with a requirement: all-or-nothing
  const ok = counted.length > 0;
  return {
    ...base,
    evidencedMinor: ok ? billedMinor : 0,
    status: ok ? 'evidenced' : 'missing',
    evidence: counted,
  };
}
