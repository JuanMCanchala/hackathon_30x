import { daysBetween, overlaps, periodKey } from './dates';
import { formatHours, hoursOf, monthName, pendingPhrase, STATUS_LABEL } from './explain';
import { convertToUsdMinor, formatMoney, parseDecimalToMinor } from './money';
import {
  mentionsPayoutChange,
  sameDestination,
  scanInstructions,
  scanPayoutMentions,
} from './scan';
import { normalizeInvoiceNumber, normalizeTaxId } from './text';
import type {
  CheckId,
  CheckResult,
  Contract,
  ContractType,
  Currency,
  DecisionContext,
  ExtractedBill,
  LineEvaluation,
  Outcome,
  Vendor,
} from './types';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A real calendar day (rejects 2026-13-45 and 2026-02-30). */
const isDay = (s: string | null | undefined): s is string => {
  const m = s ? DAY.exec(s.slice(0, 10)) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === m[0];
};
const day = (s: string) => s.slice(0, 10);

/** The vendor whose normalized tax id equals the bill's; null when absent or ambiguous. */
export function resolveVendor(reading: ExtractedBill, vendors: Vendor[]): Vendor | null {
  const id = normalizeTaxId(reading.vendorTaxId ?? '');
  if (!id) return null;
  const found = vendors.filter((v) => normalizeTaxId(v.taxId) === id);
  return found.length === 1 ? found[0]! : null;
}

function contractsOn(vendor: Vendor, contracts: Contract[], date: string | null): Contract[] {
  if (!isDay(date)) return [];
  const d = day(date);
  return contracts.filter(
    (c) =>
      c.vendorId === vendor.id &&
      day(c.validFrom) <= d &&
      (c.validTo === null || d <= day(c.validTo)),
  );
}

/** The single contract of the vendor valid on `date`; null when none or more than one. */
export function activeContract(
  vendor: Vendor,
  contracts: Contract[],
  date: string | null,
): Contract | null {
  const found = contractsOn(vendor, contracts, date);
  return found.length === 1 ? found[0]! : null;
}

/** Everything the checks look at, computed once by the engine. */
export interface Facts {
  ctx: DecisionContext;
  reading: ExtractedBill | null;
  vendor: Vendor | null;
  contract: Contract | null;
  /** currency amounts are parsed and shown in (contract's when known) */
  currency: Currency;
  billedMinor: number;
  evidencedMinor: number;
  lines: LineEvaluation[];
}

interface Verdict {
  status: CheckResult['status'];
  detail: string;
  remedy: string | null;
  onFail?: Outcome;
  /** set by a failing check whose output later checks need: they become not_run */
  blocks?: string;
}

const pass = (detail: string): Verdict => ({ status: 'pass', detail, remedy: null });
const fail = (detail: string, remedy: string, extra: Partial<Verdict> = {}): Verdict => ({
  status: 'fail',
  detail,
  remedy,
  ...extra,
});
const notRun = (why: string): Verdict => ({
  status: 'not_run',
  detail: `No se pudo verificar: ${why}.`,
  remedy: null,
});

const META: Record<CheckId, Pick<CheckResult, 'stage' | 'onFail' | 'label'>> = {
  'reading.available': { stage: 'lectura', onFail: 'ESCALATE', label: 'Lectura de la cuenta' },
  'reading.confidence': { stage: 'lectura', onFail: 'ESCALATE', label: 'Confianza de la lectura' },
  'reading.instructions': {
    stage: 'lectura',
    onFail: 'ESCALATE',
    label: 'Instrucciones dirigidas al agente',
  },
  'reading.arithmetic': { stage: 'lectura', onFail: 'ASK_VENDOR', label: 'Cuentas que cuadran' },
  'reading.period': { stage: 'lectura', onFail: 'ASK_VENDOR', label: 'Período facturado' },
  'vendor.registered': { stage: 'proveedor', onFail: 'ESCALATE', label: 'Proveedor registrado' },
  'vendor.payout': { stage: 'proveedor', onFail: 'ESCALATE', label: 'Destino del pago' },
  'contract.active': { stage: 'contrato', onFail: 'ESCALATE', label: 'Contrato vigente' },
  'contract.currency': { stage: 'contrato', onFail: 'ESCALATE', label: 'Moneda del contrato' },
  'duplicate.invoice': { stage: 'duplicado', onFail: 'HOLD', label: 'Cuenta ya recibida' },
  'duplicate.work': { stage: 'duplicado', onFail: 'HOLD', label: 'Trabajo ya facturado' },
  'match.confidence': {
    stage: 'evidencia',
    onFail: 'ESCALATE',
    label: 'Cruce de líneas con el contrato',
  },
  'terms.lines': { stage: 'contrato', onFail: 'ASK_VENDOR', label: 'Conceptos del contrato' },
  'terms.price': { stage: 'contrato', onFail: 'ASK_VENDOR', label: 'Tarifa del contrato' },
  'terms.cap': { stage: 'contrato', onFail: 'ESCALATE', label: 'Tope mensual' },
  'policy.limit': { stage: 'contrato', onFail: 'ESCALATE', label: 'Límite de pago automático' },
  'evidence.coverage': { stage: 'evidencia', onFail: 'ASK_VENDOR', label: 'Evidencia de entrega' },
  'vendor.deadline': { stage: 'plazo', onFail: 'ESCALATE', label: 'Plazo del proveedor' },
};

const CONFIDENCE_FIELD: Record<keyof ExtractedBill['confidence'], string> = {
  vendor: 'proveedor',
  invoiceNumber: 'número de cuenta',
  total: 'total',
  lines: 'líneas',
  currency: 'moneda',
  dates: 'fechas',
};

const PERIOD_BOUND: ContractType[] = ['hourly', 'retainer', 'usage'];
const TYPE_NAME: Record<ContractType, string> = {
  hourly: 'por horas',
  milestone: 'por hito',
  retainer: 'de suscripción',
  usage: 'por uso',
  goods: 'de bienes',
};
/** Statuses of a previous bill that already claim the work. */
const CLAIMING = ['PAID', 'PART_PAID', 'AWAITING_VENDOR', 'APPROVED', 'ESCALATED'];

const pct = (x: number) => `${Math.round(x * 100)} %`;
const QTY = /^(\d+)(?:\.(\d{1,2}))?$/;

/** `earlier` holds the results of the checks that ran before this one. */
type Check = (f: Facts, earlier: CheckResult[]) => Verdict;

const readingAvailable: Check = ({ reading, ctx }) =>
  reading
    ? pass('Leímos la cuenta.')
    : fail(
        `No pudimos leer la cuenta${ctx.bill.readingError ? ` (${ctx.bill.readingError})` : ''}.`,
        'Una copia legible de la cuenta, o que una persona la transcriba.',
        { blocks: 'no hay lectura de la cuenta' },
      );

const readingConfidence: Check = ({ reading, ctx }) => {
  const min = ctx.policy.minReadingConfidence;
  const low = Object.entries(reading!.confidence).filter(([, v]) => !(v >= min));
  if (low.length === 0)
    return pass(`Todos los campos se leyeron con confianza de ${pct(min)} o más.`);
  const list = low
    .map(([k, v]) => `${CONFIDENCE_FIELD[k as keyof ExtractedBill['confidence']]} ${pct(v)}`)
    .join(', ');
  return fail(
    `Confianza baja en ${list} (mínimo ${pct(min)}).`,
    'Que una persona confirme los campos dudosos o una copia más legible de la cuenta.',
  );
};

const readingInstructions: Check = ({ reading, ctx }) => {
  const texts = [
    ctx.bill.documentText,
    reading!.payoutDetails,
    ...reading!.lines.map((l) => l.description),
  ];
  const scanned = texts.some((t) => t && scanInstructions(t));
  if (!reading!.instructionsToAgent && !scanned)
    return pass('No hay texto dirigido a un sistema automático.');
  return fail(
    reading!.instructionsToAgent
      ? 'El lector encontró texto dirigido a un sistema automático.'
      : 'El documento contiene texto dirigido a un sistema automático.',
    'Que una persona revise la cuenta: Recibido nunca obedece instrucciones que vengan en ella.',
  );
};

const readingArithmetic: Check = ({ reading, currency }) => {
  const money = (m: number) => formatMoney(m, currency);
  const problems: string[] = [];
  let sum = 0;
  if (reading!.lines.length === 0) problems.push('La cuenta no tiene líneas.');
  reading!.lines.forEach((line, i) => {
    const amount = parseDecimalToMinor(line.amount, currency);
    if (amount === null || amount < 0) {
      problems.push(`La línea ${i + 1} no tiene un monto legible.`);
      return;
    }
    sum += amount;
    if (line.quantity === null || line.unitPrice === null) return;
    const q = QTY.exec(line.quantity.trim());
    const unit = parseDecimalToMinor(line.unitPrice, currency);
    if (!q || unit === null || unit < 0) {
      problems.push(`La línea ${i + 1} tiene una cantidad o un precio unitario ilegible.`);
      return;
    }
    const hundredths = BigInt(q[1]! + (q[2] ?? '').padEnd(2, '0'));
    const diff = BigInt(amount) * 100n - hundredths * BigInt(unit); // in 1/100 minor units
    if (diff > 100n || diff < -100n) {
      const expected = Number((hundredths * BigInt(unit) + 50n) / 100n);
      problems.push(
        `La línea ${i + 1} dice ${money(amount)}, pero ${line.quantity} × ${money(unit)} = ${money(expected)}.`,
      );
    }
  });
  const total = parseDecimalToMinor(reading!.total, currency);
  if (total === null || total <= 0) problems.push('El total no se pudo leer como un monto.');
  else if (problems.length === 0 && sum !== total)
    problems.push(`Las líneas suman ${money(sum)} y el total dice ${money(total)}.`);
  if (problems.length === 0) return pass(`Cada línea y el total (${money(total!)}) cuadran.`);
  return fail(problems.join(' '), 'Una cuenta corregida en la que cada línea y el total cuadren.');
};

const readingPeriod: Check = ({ reading, contract }) => {
  if (!contract) return notRun('sin contrato vigente no sabemos si la cuenta necesita período');
  if (!PERIOD_BOUND.includes(contract.type))
    return pass(`Un contrato ${TYPE_NAME[contract.type]} no exige período.`);
  const { periodFrom: from, periodTo: to } = reading!;
  if (isDay(from) && isDay(to) && day(from) <= day(to))
    return pass(`Período del ${day(from)} al ${day(to)}.`);
  return fail(
    `La cuenta ${TYPE_NAME[contract.type]} no indica un período válido (desde y hasta).`,
    'Una cuenta corregida que indique el período facturado.',
  );
};

const vendorRegistered: Check = ({ reading, vendor }) =>
  vendor
    ? pass(`${vendor.legalName}, identificación ${vendor.taxId}.`)
    : fail(
        `No hay un proveedor registrado con la identificación ${reading!.vendorTaxId ?? '(la cuenta no trae)'}${reading!.vendorName ? ` (${reading!.vendorName})` : ''}.`,
        'Registrar al proveedor y su contrato, o confirmar a quién corresponde la cuenta.',
        { blocks: 'el proveedor no está registrado' },
      );

const vendorPayout: Check = ({ reading, vendor, ctx }) => {
  const registered = vendor!.payout;
  const texts = [
    reading!.payoutDetails,
    ctx.bill.documentText,
    ...reading!.lines.map((l) => l.description),
  ].filter((t): t is string => !!t);
  const remedy =
    'Confirmar con el proveedor por un canal conocido. Los datos de pago solo cambian en el registro de proveedores, nunca desde una cuenta o un mensaje.';
  // tax ids printed on every bill (the vendor's own, the buyer's) and the bill's own amounts are
  // not destinations
  const opts = {
    ignoreIds: [vendor!.taxId, ...(ctx.bill.knownNonPayoutIds ?? [])],
    amounts: [reading!.total, ...reading!.lines.flatMap((l) => [l.amount, l.unitPrice])],
  };
  const candidates = [...new Set(texts.flatMap((t) => scanPayoutMentions(t, opts)))];
  const other = candidates.filter((c) => !sameDestination(c, registered.destination));
  const named = other.length
    ? `${other.length === 1 ? 'el destino' : 'los destinos'} ${other.join(', ')}`
    : '';
  if (texts.some(mentionsPayoutChange))
    return fail(
      `La cuenta o el mensaje pide cambiar los datos de pago${named ? ` (aparece ${named})` : ''}.`,
      remedy,
    );
  if (other.length)
    return fail(`Aparece ${named}, distinto del registrado (${registered.display}).`, remedy);
  return pass(
    candidates.length
      ? `Los datos de pago que trae la cuenta coinciden con el destino registrado (${registered.display}).`
      : `Pagamos solo al destino registrado (${registered.display}).`,
  );
};

const contractActive: Check = ({ reading, vendor, contract, ctx }) => {
  if (contract) return pass(`${contract.title}, vigente desde el ${day(contract.validFrom)}.`);
  const date = reading!.issueDate;
  const remedy = 'Un único contrato vigente para la fecha de la cuenta, cargado en Recibido.';
  const blocks = { blocks: 'no hay un contrato vigente' };
  if (!isDay(date)) return fail('La cuenta no tiene una fecha de emisión válida.', remedy, blocks);
  const n = contractsOn(vendor!, ctx.contracts, date).length;
  return fail(
    n > 1
      ? `${vendor!.name} tiene ${n} contratos vigentes el ${day(date)}; no sabemos cuál aplica.`
      : `${vendor!.name} no tiene contrato vigente el ${day(date)}.`,
    remedy,
    blocks,
  );
};

const contractCurrency: Check = ({ reading, contract }) => {
  const billed = reading!.currency?.trim().toUpperCase() ?? null;
  if (billed === contract!.currency) return pass(`${billed}, como el contrato.`);
  return fail(
    `La cuenta está en ${billed ?? '(sin moneda)'} y el contrato en ${contract!.currency}.`,
    `Una cuenta en ${contract!.currency}, la moneda del contrato.`,
    { blocks: 'la moneda de la cuenta no es la del contrato' },
  );
};

/** Previous bills that are not this bill nor one it supersedes. */
const others = ({ ctx }: Facts) =>
  ctx.history.filter((h) => h.billId !== ctx.bill.id && !ctx.bill.chain.includes(h.billId));

const duplicateInvoice: Check = (f) => {
  const number = f.reading!.invoiceNumber;
  if (!number?.trim()) return notRun('la cuenta no trae número');
  const n = normalizeInvoiceNumber(number);
  const dup = others(f).find(
    (h) =>
      h.vendorId === f.vendor!.id &&
      h.invoiceNumberNormalized === n &&
      h.status !== 'REJECTED' &&
      h.status !== 'SUPERSEDED',
  );
  if (!dup) return pass(`Es la primera vez que llega la cuenta ${number}.`);
  return fail(
    `La cuenta ${number} ya había llegado (${dup.billId}, ${STATUS_LABEL[dup.status].toLowerCase()}).`,
    'Si es una cuenta corregida, que diga qué cuenta reemplaza; si no, no se paga dos veces.',
  );
};

const duplicateWork: Check = (f) => {
  const contract = f.contract!;
  const reading = f.reading!;
  const claiming = others(f).filter(
    (h) => h.contractId === contract.id && CLAIMING.includes(h.status),
  );
  const remedy =
    'Si reemplaza una cuenta anterior, que lo diga (cuenta corregida); si no, es trabajo ya facturado.';
  if (PERIOD_BOUND.includes(contract.type)) {
    const { periodFrom: from, periodTo: to } = reading;
    // Without a period nothing can pay (reading.period asks for it); the corrected bill re-runs this.
    if (!isDay(from) || !isDay(to))
      return pass('Sin período no hay trabajo que comparar; se compara cuando llegue.');
    const dup = claiming.find(
      (h) =>
        // deny by default: a previous bill without a readable period counts as overlapping
        !isDay(h.periodFrom) ||
        !isDay(h.periodTo) ||
        overlaps(day(from), day(to), day(h.periodFrom), day(h.periodTo)),
    );
    if (!dup) return pass(`Nadie más cobró el período del ${day(from)} al ${day(to)}.`);
    return fail(
      `El período ya está en la cuenta ${dup.billId} (${STATUS_LABEL[dup.status].toLowerCase()}) del mismo contrato.`,
      remedy,
    );
  }
  const { matches, matchError } = f.ctx;
  if (!matches || matchError !== null)
    return notRun('sin cruce de líneas no sabemos qué hitos cobra');
  const termIds = new Set(
    matches.map((m) => m.termId).filter((id) => contract.terms.some((t) => t.id === id)),
  );
  const dup = claiming.find((h) => h.termIds.some((id) => termIds.has(id)));
  if (!dup) return pass('Ningún hito de esta cuenta se había cobrado antes.');
  const title = contract.terms.find((t) => dup.termIds.includes(t.id) && termIds.has(t.id))?.title;
  return fail(
    `${title ?? 'El hito'} ya está en la cuenta ${dup.billId} (${STATUS_LABEL[dup.status].toLowerCase()}).`,
    remedy,
  );
};

const matchConfidence: Check = ({ ctx }) => {
  const { matches, matchError } = ctx;
  if (matchError !== null || !matches)
    return fail(
      `No se pudieron cruzar las líneas con el contrato${matchError ? ` (${matchError})` : ''}.`,
      'Que una persona indique a qué concepto del contrato corresponde cada línea.',
      { blocks: 'no hay cruce de líneas con el contrato' },
    );
  const min = ctx.policy.minMatchConfidence;
  const low = matches.filter((m) => !(m.confidence >= min));
  if (low.length === 0) return pass(`Cada línea se cruzó con confianza de ${pct(min)} o más.`);
  return fail(
    low
      .map((m) => `Cruce dudoso en la línea ${m.lineIndex + 1} (${pct(m.confidence)}).`)
      .join(' ') + ` El mínimo es ${pct(min)}.`,
    'Que una persona confirme a qué concepto del contrato corresponde cada línea.',
  );
};

const termsLines: Check = ({ lines, contract }) => {
  const problems: string[] = [];
  const firstLine = new Map<string, number>();
  for (const l of lines) {
    if (l.termId === null || !contract!.terms.some((t) => t.id === l.termId)) {
      problems.push(`La línea ${l.lineIndex + 1} no corresponde a ningún concepto del contrato.`);
      continue;
    }
    const prev = firstLine.get(l.termId);
    // the same term on two lines would count the same evidence twice
    if (prev !== undefined)
      problems.push(
        `Las líneas ${prev + 1} y ${l.lineIndex + 1} cobran el mismo concepto (${l.termTitle}).`,
      );
    else firstLine.set(l.termId, l.lineIndex);
  }
  if (problems.length === 0) return pass('Cada línea corresponde a un concepto del contrato.');
  return fail(
    problems.join(' '),
    'Una cuenta corregida que cobre solo conceptos del contrato, cada uno en una línea.',
  );
};

const termsPrice: Check = ({ reading, lines, contract, currency }) => {
  const money = (m: number) => formatMoney(m, currency);
  const problems: string[] = [];
  for (const l of lines) {
    const term = contract!.terms.find((t) => t.id === l.termId);
    if (!term) continue;
    const line = reading!.lines[l.lineIndex]!;
    const fixed = term.kind === 'milestone' || term.kind === 'retainer';
    const price = parseDecimalToMinor(fixed ? line.amount : line.unitPrice, currency);
    const per = term.kind === 'hours' ? '/h' : fixed ? '' : ' por unidad';
    if (price === null) problems.push(`La línea ${l.lineIndex + 1} no trae un precio legible.`);
    else if (price > term.unitPriceMinor)
      problems.push(
        `La línea ${l.lineIndex + 1} cobra ${money(price)}${per}, más que la tarifa del contrato (${money(term.unitPriceMinor)}${per}).`,
      );
  }
  if (problems.length === 0) return pass('Ninguna línea supera la tarifa del contrato.');
  return fail(problems.join(' '), 'Una cuenta corregida con la tarifa del contrato.');
};

const termsCap: Check = (f) => {
  const contract = f.contract!;
  const reading = f.reading!;
  const money = (m: number) => formatMoney(m, f.currency);
  const month = periodKey(isDay(reading.periodFrom) ? reading.periodFrom : reading.issueDate!);
  const before = others(f)
    .filter(
      (h) =>
        h.contractId === contract.id &&
        h.paidMinor > 0 &&
        // deny by default: a paid bill we cannot place in a month counts against this one
        (!isDay(h.periodFrom) || periodKey(h.periodFrom) === month),
    )
    .reduce((s, h) => s + h.paidMinor, 0);
  const total = before + Math.max(f.evidencedMinor, f.ctx.case.paidMinor);
  const where = `en ${monthName(month)}`;
  if (total <= contract.periodCapMinor)
    return pass(`${money(total)} de ${money(contract.periodCapMinor)} ${where}.`);
  return fail(
    `Con esta cuenta el contrato llega a ${money(total)} ${where}, sobre el tope de ${money(contract.periodCapMinor)}.`,
    'Que una persona apruebe el exceso o se ajuste el tope del contrato.',
  );
};

const policyLimit: Check = (f) => {
  const amount = Math.max(0, f.evidencedMinor - f.ctx.case.paidMinor);
  const limit = f.ctx.policy.autoPayLimitUsdMinor;
  let usd: number;
  try {
    usd = convertToUsdMinor(amount, f.currency, f.ctx.fx);
  } catch {
    return fail(
      `No hay una tasa de cambio usable para ${f.currency} (tasas del ${f.ctx.fx.asOf}).`,
      'Cargar una tasa de cambio vigente o que una persona apruebe el pago.',
    );
  }
  const shown = `${formatMoney(amount, f.currency)}${f.currency === 'USD' ? '' : ` (≈ ${formatMoney(usd, 'USD')})`}`;
  if (usd <= limit)
    return pass(
      `${shown} está dentro del límite de pago automático de ${formatMoney(limit, 'USD')}.`,
    );
  return fail(
    `${shown} supera el límite de pago automático de ${formatMoney(limit, 'USD')}.`,
    'Que una persona apruebe el pago.',
  );
};

const evidenceCoverage: Check = ({
  ctx,
  billedMinor,
  evidencedMinor,
  lines,
  contract,
  currency,
}) => {
  const money = (m: number) => formatMoney(m, currency);
  if (ctx.case.paidMinor > billedMinor)
    return fail(
      `Ya se pagó más de lo que ahora se cobra: pagamos ${money(ctx.case.paidMinor)} y la cuenta cobra ${money(billedMinor)}.`,
      'Que una persona revise el caso y gestione la devolución o una nota crédito.',
      { onFail: 'ESCALATE' },
    );
  if (evidencedMinor === billedMinor && billedMinor > 0)
    return pass(
      `Todo lo facturado (${money(billedMinor)}) tiene evidencia o no la exige el contrato.`,
    );
  const hours = hoursOf(lines, contract);
  const missing = lines
    .filter((l) => l.evidencedMinor < l.billedMinor)
    .map(
      (l) =>
        `${pendingPhrase(
          l,
          contract!.terms.find((t) => t.id === l.termId),
        )}.`,
    );
  const remedy =
    evidencedMinor === 0
      ? 'La evidencia de entrega que pide el contrato para lo facturado.'
      : hours
        ? `El registro de las ${formatHours(hours.billed - hours.evidenced)} restantes o una cuenta corregida por ${formatHours(hours.evidenced)}.`
        : `La evidencia de los ${money(billedMinor - evidencedMinor)} restantes o una cuenta corregida por ${money(evidencedMinor)}.`;
  const headline =
    evidencedMinor === 0
      ? `No hay evidencia de lo facturado (${money(billedMinor)}).`
      : `Hay evidencia de ${money(evidencedMinor)} de ${money(billedMinor)} facturados.`;
  return fail([headline, ...missing].join(' '), remedy, {
    onFail: contract!.allowPartial && evidencedMinor > 0 ? 'PAY_PART' : 'ASK_VENDOR',
  });
};

const vendorDeadline: Check = ({ ctx, contract, billedMinor, evidencedMinor }, earlier) => {
  const { askedAt } = ctx.case;
  if (askedAt === null) return pass('No hay un pedido pendiente al proveedor.');
  const stillAsking = earlier.some((c) => c.status === 'fail' && c.onFail === 'ASK_VENDOR');
  if (evidencedMinor === billedMinor && billedMinor > 0 && !stillAsking)
    return pass('El proveedor ya resolvió lo pendiente.');
  const limit = contract!.vendorResponseDays;
  let days: number;
  try {
    days = daysBetween(askedAt, ctx.now);
  } catch {
    return fail(
      'La fecha del pedido al proveedor no es válida.',
      'Que una persona revise el caso.',
    );
  }
  if (days <= limit) return pass(`Le escribimos hace ${days} días; el plazo es de ${limit}.`);
  return fail(
    `Le escribimos al proveedor hace ${days} días y el plazo era de ${limit}; no resolvió lo pendiente.`,
    'Que una persona decida o contacte al proveedor.',
  );
};

const CHECKS: [CheckId, Check][] = [
  ['reading.available', readingAvailable],
  ['reading.confidence', readingConfidence],
  ['reading.instructions', readingInstructions],
  ['reading.arithmetic', readingArithmetic],
  ['reading.period', readingPeriod],
  ['vendor.registered', vendorRegistered],
  ['vendor.payout', vendorPayout],
  ['contract.active', contractActive],
  ['contract.currency', contractCurrency],
  ['duplicate.invoice', duplicateInvoice],
  ['duplicate.work', duplicateWork],
  ['match.confidence', matchConfidence],
  ['terms.lines', termsLines],
  ['terms.price', termsPrice],
  ['terms.cap', termsCap],
  ['policy.limit', policyLimit],
  ['evidence.coverage', evidenceCoverage],
  ['vendor.deadline', vendorDeadline],
];

/**
 * Runs every check in order. Once a check that later checks depend on fails, the rest are
 * `not_run` (which the engine treats as ESCALATE): deny by default.
 */
export function runChecks(facts: Facts): CheckResult[] {
  let blocked: string | null = null;
  const results: CheckResult[] = [];
  for (const [id, check] of CHECKS) {
    const v: Verdict = blocked ? notRun(blocked) : check(facts, results);
    if (!blocked && v.status !== 'pass' && v.blocks) blocked = v.blocks;
    const meta = META[id];
    results.push({
      id,
      stage: meta.stage,
      status: v.status,
      onFail: v.onFail ?? meta.onFail,
      label: meta.label,
      detail: v.detail,
      remedy: v.remedy,
    });
  }
  return results;
}
