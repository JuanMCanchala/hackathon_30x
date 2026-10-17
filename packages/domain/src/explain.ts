import { formatMoney } from './money';
import { parseHoursToMinutes } from './text';
import type {
  BillStatus,
  CheckResult,
  Contract,
  ContractTerm,
  Currency,
  Decision,
  DecisionContext,
  EvidenceItem,
  LineEvaluation,
  Outcome,
} from './types';

// Every receipt sentence is generated here, from code — never by the language model.

export const OUTCOME_LABEL: Record<Outcome, string> = {
  PAY: 'Pagar',
  PAY_PART: 'Pagar una parte',
  ASK_VENDOR: 'Pedir al proveedor',
  ESCALATE: 'Escalar a una persona',
  HOLD: 'Frenar',
};

export const STATUS_LABEL: Record<BillStatus, string> = {
  RECEIVED: 'Recibida',
  PAID: 'Pagada',
  PART_PAID: 'Pagada en parte',
  AWAITING_VENDOR: 'Esperando al proveedor',
  ESCALATED: 'Con una persona',
  HELD: 'Frenada',
  APPROVED: 'Aprobada por una persona',
  REJECTED: 'Rechazada',
  SUPERSEDED: 'Reemplazada',
};

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const SOURCE_NAME: Record<EvidenceItem['source'], string> = {
  github: 'GitHub',
  toggl: 'Toggl',
  linear: 'Linear',
  entregables: 'Entregables',
  medidor: 'el medidor',
  entregas: 'Entregas',
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-10" → "octubre de 2026" */
export function monthName(isoDate: string): string {
  const m = DAY.exec(isoDate) ?? /^(\d{4})-(\d{2})/.exec(isoDate);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} de ${m[1]}` : isoDate;
}

/** "para octubre" when the period is one calendar month, else "entre el … y el …". */
export function periodPhrase(from: string | null, to: string | null): string {
  const f = from ? DAY.exec(from) : null;
  const t = to ? DAY.exec(to) : null;
  if (!f || !t) return '';
  if (f[1] === t[1] && f[2] === t[2]) return `para ${MONTHS[Number(f[2]) - 1]}`;
  return `entre el ${f[0]} y el ${t[0]}`;
}

/** 5520 → "92 h", 5550 → "92,5 h" */
export function formatHours(minutes: number): string {
  const h = (minutes / 60).toFixed(2).replace(/\.?0+$/, '');
  return `${h.replace('.', ',')} h`;
}

/** Billed vs evidenced minutes when every line is an hours line of the contract; else null. */
export function hoursOf(
  lines: LineEvaluation[],
  contract: Contract | null,
): { billed: number; evidenced: number } | null {
  if (!contract || lines.length === 0) return null;
  let billed = 0;
  let evidenced = 0;
  for (const l of lines) {
    const term = contract.terms.find((t) => t.id === l.termId);
    if (term?.kind !== 'hours') return null;
    billed += parseHoursToMinutes(l.billedQuantity ?? '') ?? 0;
    evidenced += parseHoursToMinutes(l.evidencedQuantity ?? '') ?? 0;
  }
  return { billed, evidenced };
}

/** What is missing on a line whose evidence does not cover it (Spanish, no final period). */
export function pendingPhrase(line: LineEvaluation, term: ContractTerm | undefined): string {
  const title = line.termTitle ?? line.description;
  const req = term?.evidence;
  if (!req) return `${title}: sin evidencia`;
  switch (req.type) {
    case 'time_entries':
      return `${title}: hay registro de ${formatHours(parseHoursToMinutes(line.evidencedQuantity ?? '') ?? 0)} de ${formatHours(parseHoursToMinutes(line.billedQuantity ?? '') ?? 0)}`;
    case 'github_pr':
      return `${title}: el PR ${req.repo}#${req.number} todavía no está fusionado`;
    case 'deliverable':
      return `${title}: el entregable todavía no está aprobado`;
    case 'ticket':
      return `${title}: el ticket ${req.key} todavía no está cerrado`;
    case 'usage_report':
      return `${title}: no hay reporte de uso de ${req.meter} para el período`;
    case 'delivery':
      return `${title}: no hay confirmación de entrega del pedido ${req.orderId}`;
  }
}

/** Remedies of the checks that did not pass, in check order. */
export function counterfactual(checks: CheckResult[]): string[] {
  return checks.flatMap((c) => (c.status !== 'pass' && c.remedy ? [c.remedy] : []));
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function sources(lines: LineEvaluation[]): string {
  const names = [...new Set(lines.flatMap((l) => l.evidence.map((e) => SOURCE_NAME[e.source])))];
  return names.length ? ` en ${names.join(' y ')}` : '';
}

function evidenceList(lines: LineEvaluation[]): string {
  return lines
    .map((l) =>
      l.status === 'not_required'
        ? `${l.termTitle} se paga según el contrato firmado`
        : `${l.termTitle} tiene evidencia (${l.evidence.map((e) => e.ref).join(', ') || 'ninguna'})`,
    )
    .join('; ');
}

function reasons(checks: CheckResult[], onFail: Outcome[]): string {
  const failed = checks.filter((c) => c.status === 'fail' && onFail.includes(c.onFail));
  const picked = failed.length ? failed : checks.filter((c) => c.status === 'not_run');
  return [...new Set(picked.map((c) => c.detail))].join(' ');
}

interface Parts {
  money: (minor: number) => string;
  hours: { billed: number; evidenced: number } | null;
  period: string;
  contract: Contract | null;
  first: string;
}

function parts(d: Decision, ctx: DecisionContext): Parts {
  const currency: Currency = d.currency ?? 'USD';
  const contract = ctx.contracts.find((c) => c.id === d.contractId) ?? null;
  const vendor = ctx.vendors.find((v) => v.id === d.vendorId);
  const r = ctx.bill.reading;
  return {
    money: (m) => formatMoney(m, currency),
    hours: hoursOf(d.lines, contract),
    period: periodPhrase(r?.periodFrom ?? null, r?.periodTo ?? null),
    contract,
    first: vendor ? firstName(vendor.contactName) : 'el proveedor',
  };
}

const sp = (s: string) => (s ? ` ${s}` : '');

/** One Spanish sentence (two at most) explaining the outcome with its numbers. */
export function summarize(d: Decision, ctx: DecisionContext): string {
  const { money, hours, period, first } = parts(d, ctx);
  switch (d.outcome) {
    case 'PAY': {
      if (d.payNowMinor === 0)
        return `No pagamos de nuevo: lo evidenciado (${money(d.evidencedMinor)}) ya estaba pagado, así que cerramos el caso.`;
      if (hours) {
        const prs = d.lines.reduce((n, l) => n + l.supporting.length, 0);
        const backed = prs ? `, con ${prs} PR fusionados` : '';
        return `Pagamos ${money(d.payNowMinor)} por ${formatHours(hours.billed)}: hay registro de ${formatHours(hours.evidenced)}${sources(d.lines)}${sp(period)}${backed}.`;
      }
      return `Pagamos ${money(d.payNowMinor)}: ${evidenceList(d.lines)}.`;
    }
    case 'PAY_PART': {
      if (hours) {
        const rest = formatHours(hours.billed - hours.evidenced);
        return `Pagamos ${formatHours(hours.evidenced)} de ${formatHours(hours.billed)} facturadas: hay registro de ${formatHours(hours.evidenced)}${sources(d.lines)}${sp(period)}. Pedimos a ${first} el soporte de las ${rest} restantes.`;
      }
      return `Pagamos ${money(d.payNowMinor)} de ${money(d.billedMinor)} facturados: ${evidenceList(d.lines.filter((l) => l.evidencedMinor > 0))}. Pedimos a ${first} el soporte de los ${money(d.askMinor)} restantes.`;
    }
    case 'ASK_VENDOR':
      return `No pagamos todavía y le escribimos a ${first}. ${reasons(d.checks, ['ASK_VENDOR', 'PAY_PART'])}`;
    case 'ESCALATE':
      return `Lo pasamos a una persona. ${reasons(d.checks, ['ESCALATE'])}`;
    case 'HOLD':
      return `Frenamos la cuenta. ${reasons(d.checks, ['HOLD'])}`;
  }
}

/**
 * The message to the vendor for ASK_VENDOR and PAY_PART, addressed by first name. Built only
 * from the vendor-fixable checks, so it never carries payout details.
 */
export function vendorMessage(d: Decision, ctx: DecisionContext): string | null {
  if (d.outcome !== 'ASK_VENDOR' && d.outcome !== 'PAY_PART') return null;
  const { money, hours, period, contract, first } = parts(d, ctx);
  if (!contract || first === 'el proveedor') return null;
  const inv = ctx.bill.reading?.invoiceNumber ?? 'sin número';
  const fixable = d.checks.filter(
    (c) => c.status === 'fail' && (c.onFail === 'ASK_VENDOR' || c.onFail === 'PAY_PART'),
  );
  const onlyCoverage = fixable.length === 1 && fixable[0]?.id === 'evidence.coverage';
  const scheduled = d.outcome === 'PAY_PART';

  if (onlyCoverage && hours) {
    const ev = formatHours(hours.evidenced);
    const logged = hours.evidenced
      ? `hay registro de ${ev}${sp(period)}`
      : `no hay registro de horas${sp(period)}`;
    const paid = scheduled ? ` Ya programamos el pago de las ${ev}.` : '';
    return `Hola ${first}: facturaste ${formatHours(hours.billed)} en la cuenta ${inv} y ${logged}.${paid} ¿Puedes adjuntar el registro del resto o enviar la cuenta corregida?`;
  }

  const issues = fixable.flatMap((c) =>
    c.id === 'evidence.coverage'
      ? d.lines
          .filter((l) => l.evidencedMinor < l.billedMinor)
          .map(
            (l) =>
              `${pendingPhrase(
                l,
                contract.terms.find((t) => t.id === l.termId),
              )}.`,
          )
      : [c.detail],
  );
  const paid = scheduled ? ` Ya programamos el pago de ${money(d.payNowMinor)}.` : '';
  const ask = onlyCoverage
    ? '¿Puedes avisarnos cuando esté listo o enviar la cuenta corregida?'
    : '¿Puedes enviar la cuenta corregida?';
  const cannot = scheduled ? 'todavía no podemos pagarla completa' : 'todavía no podemos pagarla';
  return `Hola ${first}: revisamos la cuenta ${inv} y ${cannot}. ${issues.join(' ')}${paid} ${ask}`;
}
