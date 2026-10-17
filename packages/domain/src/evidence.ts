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

/**
 * Deny by default: without a well-formed period nothing counts. Compares the ISO date prefix as
 * written (offsets ignored), inclusive.
 */
function inPeriod(item: EvidenceItem, from: string | null, to: string | null): boolean {
  const f = from && DAY.exec(from)?.[0];
  const t = to && DAY.exec(to)?.[0];
  const d = DAY.exec(item.occurredAt)?.[0];
  return !!(f && t && d && d >= f && d <= t);
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

const QTY_SCALE = 6;
const STRICT_DECIMAL = /^(\d+)(?:\.(\d{1,6}))?$/;

/** Strict decimal → integer at 10^-6 scale; null when malformed or too precise. */
function parseQty(q: string | null | undefined): bigint | null {
  const m = STRICT_DECIMAL.exec((q ?? '').trim());
  if (!m) return null;
  return BigInt(m[1]! + (m[2] ?? '').padEnd(QTY_SCALE, '0'));
}

function qtyToString(scaled: bigint): string {
  const s = scaled.toString().padStart(QTY_SCALE + 1, '0');
  const frac = s.slice(-QTY_SCALE).replace(/0+$/, '');
  const whole = s.slice(0, -QTY_SCALE);
  return frac ? whole + '.' + frac : whole;
}

/** Minutes → decimal hours, at most 2 decimals, no trailing zeros ('5550' → '92.5'). */
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

  const periodBound = term.kind === 'hours' || term.kind === 'usage';
  const inScope = (e: EvidenceItem) => !periodBound || inPeriod(e, bill.periodFrom, bill.periodTo);
  const { kind, ref } = closing(term.evidence);
  const mine = evidence.filter((e) => e.vendorId === vendorId);
  const seen = new Set<string>();
  const counted = mine.filter((e) => {
    if (e.kind !== kind || e.ref !== ref || !inScope(e) || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  const unitMinor = parseDecimalToMinor(line.unitPrice, currency);

  if (term.kind === 'hours') {
    const billedMinutes = (line.quantity && parseHoursToMinutes(line.quantity)) || 0;
    // only whole, positive minutes count; a fractional or negative entry is not evidence
    const logged = counted.reduce(
      (sum, e) =>
        sum +
        (e.minutes !== undefined && Number.isSafeInteger(e.minutes) && e.minutes > 0
          ? e.minutes
          : 0),
      0,
    );
    const minutes = unitMinor === null ? 0 : Math.min(billedMinutes, logged);
    const evidencedMinor = Math.min(
      billedMinor,
      Number((BigInt(minutes) * BigInt(unitMinor ?? 0)) / 60n),
    );
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
    const billedQty = parseQty(line.quantity) ?? 0n;
    const reported = counted.reduce((sum, e) => sum + (parseQty(e.quantity) ?? 0n), 0n);
    const qty = unitMinor === null ? 0n : billedQty < reported ? billedQty : reported;
    const evidencedMinor = Math.min(
      billedMinor,
      Number((qty * BigInt(unitMinor ?? 0)) / 10n ** BigInt(QTY_SCALE)),
    );
    return {
      ...base,
      evidencedMinor,
      evidencedQuantity: qtyToString(qty),
      status: statusOf(evidencedMinor, billedMinor),
      evidence: counted,
    };
  }

  // milestone / goods / retainer with a requirement: all-or-nothing, not period-bound
  const ok = counted.length > 0;
  return {
    ...base,
    evidencedMinor: ok ? billedMinor : 0,
    status: ok ? 'evidenced' : 'missing',
    evidence: counted,
  };
}
