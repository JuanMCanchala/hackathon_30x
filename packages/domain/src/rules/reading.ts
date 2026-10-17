import { daysBetween } from '../dates';
import type { Derived } from '../derive';
import { formatDate, formatMoney, formatPercent, joinSpanish } from '../format';
import { parseDecimalToMinor } from '../money';
import { foldName, nameSimilarity, normalizeTaxId } from '../text';
import { defineRule, fail, pass, skip } from './helpers';

const UNREADABLE = 'No pude leer el documento';

/** Adds a final period unless the text already ends with one ("Andes Labs Inc."). */
const endSentence = (text: string) => (text.endsWith('.') ? text : `${text}.`);

export const documentType = defineRule(
  {
    id: 'reading.document_type',
    stage: 'reading',
    title: 'Es una cuenta por pagar',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.x) {
      const reason = d.ctx.invoice.extractionError;
      return fail(
        meta,
        `${UNREADABLE}${reason ? `: ${reason}` : ''}.`,
        'el documento fuera legible (PDF, imagen nítida, correo o mensaje con los datos del cobro)',
      );
    }
    switch (d.x.documentType) {
      case 'invoice':
        return pass(meta, 'Es una factura.');
      case 'cuenta_de_cobro':
        return pass(meta, 'Es una cuenta de cobro.');
      case 'credit_note':
        return fail(
          meta,
          'Es una nota crédito, no un cobro.',
          'fuera una factura o cuenta de cobro',
        );
      case 'receipt':
        return fail(
          meta,
          'Es un comprobante de pago: parece algo ya pagado.',
          'fuera una factura o cuenta de cobro pendiente',
        );
      case 'not_an_invoice':
        return fail(
          meta,
          'No parece una factura ni una cuenta de cobro.',
          'fuera una factura o cuenta de cobro',
        );
      default:
        return fail(
          meta,
          'No pude determinar qué tipo de documento es.',
          'fuera claramente una factura o cuenta de cobro',
        );
    }
  },
);

export const requiredFields = defineRule(
  {
    id: 'reading.required_fields',
    stage: 'reading',
    title: 'Datos completos',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.x) return skip(meta, 'Sin lectura del documento no hay datos que revisar.', false);
    const missing: string[] = [];
    if (!d.x.issuer.name && !d.x.issuer.taxId && !d.x.payout.destination)
      missing.push('quién cobra');
    if (!d.currency) missing.push('la moneda');
    if (d.amountMinor === null || d.amountMinor <= 0) missing.push('un monto total válido');
    if (!d.x.invoiceNumber) missing.push('el número de factura');
    if (!d.issueDate) missing.push('la fecha de emisión');
    if (missing.length === 0) {
      return pass(meta, 'Tiene quién cobra, monto, moneda, número y fecha de emisión.');
    }
    return fail(
      meta,
      `Faltan datos: ${joinSpanish(missing)}.`,
      `la factura incluyera ${joinSpanish(missing)}`,
    );
  },
);

const CONFIDENCE_LABELS: Record<string, string> = {
  issuer: 'quién cobra',
  invoiceNumber: 'el número',
  issueDate: 'la fecha de emisión',
  dueDate: 'el vencimiento',
  currency: 'la moneda',
  total: 'el monto',
  payout: 'los datos de pago',
};

export const confidence = defineRule(
  {
    id: 'reading.confidence',
    stage: 'reading',
    title: 'Lectura confiable',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.x || d.minConfidence === null) return skip(meta, 'Sin lectura del documento.', false);
    const threshold = d.terms.minExtractionConfidence;
    const expected = `≥ ${formatPercent(threshold)}`;
    if (d.minConfidence >= threshold) {
      return pass(
        meta,
        `Leí los datos clave con confianza suficiente (mínimo ${formatPercent(d.minConfidence)}).`,
        { observed: formatPercent(d.minConfidence), expected },
      );
    }
    const c = d.x.confidence;
    const present: Record<string, boolean> = {
      issuer: Boolean(d.x.issuer.name || d.x.issuer.taxId),
      invoiceNumber: Boolean(d.x.invoiceNumber),
      issueDate: Boolean(d.x.issueDate),
      dueDate: Boolean(d.x.dueDate),
      currency: true,
      total: true,
      payout: Boolean(d.x.payout.destination),
    };
    const low = (Object.keys(CONFIDENCE_LABELS) as (keyof typeof c)[])
      .filter((k) => present[k] && c[k] < threshold)
      .map((k) => CONFIDENCE_LABELS[k] ?? k);
    return fail(
      meta,
      `No leí con suficiente confianza ${joinSpanish(low)} (${formatPercent(d.minConfidence)}).`,
      `el documento fuera más legible (confianza ${expected})`,
      { observed: formatPercent(d.minConfidence), expected },
    );
  },
);

export const arithmetic = defineRule(
  {
    id: 'reading.arithmetic',
    stage: 'reading',
    title: 'Los números cuadran',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.x) return skip(meta, 'Sin lectura del documento.', false);
    if (d.x.lineItems.length === 0) {
      return skip(meta, 'La factura no detalla ítems; se usa el total.', true);
    }
    if (!d.currency || d.amountMinor === null) {
      return skip(meta, 'Sin monto total o moneda no puedo verificar las sumas.', false);
    }
    const currency = d.currency;
    const parse = (v: string) => parseDecimalToMinor(v, currency);
    const items = d.x.lineItems.map((i) => parse(i.amount));
    const taxes = d.x.taxes.map((t) => ({ kind: t.kind, amount: parse(t.amount) }));
    if (items.some((v) => v === null) || taxes.some((t) => t.amount === null)) {
      return fail(
        meta,
        'No pude verificar las sumas: hay valores ilegibles en los ítems o impuestos.',
        'los ítems e impuestos fueran legibles',
      );
    }
    const itemsTotal = items.reduce<number>((s, v) => s + (v ?? 0), 0);
    const taxTotal = taxes.reduce(
      (s, t) => s + (t.kind === 'withholding' ? -(t.amount ?? 0) : (t.amount ?? 0)),
      0,
    );
    const computed = itemsTotal + taxTotal;
    const tolerance = d.x.lineItems.length;
    const observed = formatMoney(computed, currency);
    const expected = formatMoney(d.amountMinor, currency);
    if (Math.abs(computed - d.amountMinor) <= tolerance) {
      return pass(meta, `Ítems e impuestos (${observed}) cuadran con el total (${expected}).`, {
        observed,
        expected,
      });
    }
    return fail(
      meta,
      `Los ítems e impuestos suman ${observed}, pero el total dice ${expected}.`,
      'los ítems e impuestos sumaran exactamente el total',
      { observed, expected },
    );
  },
);

export const amountInWords = defineRule(
  {
    id: 'reading.amount_in_words',
    stage: 'reading',
    title: 'Monto en letras coincide',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.x) return skip(meta, 'Sin lectura del documento.', false);
    if (!d.x.amountInWords) return skip(meta, 'No trae monto en letras.', true);
    if (!d.currency || d.amountMinor === null) {
      return skip(meta, 'Sin monto en números no puedo comparar.', false);
    }
    const words = parseDecimalToMinor(d.x.amountInWordsValue, d.currency);
    if (words === null) {
      return fail(
        meta,
        `No pude interpretar el monto en letras («${d.x.amountInWords}»).`,
        'el monto en letras fuera legible y coincidiera con el número',
      );
    }
    const observed = formatMoney(words, d.currency);
    const expected = formatMoney(d.amountMinor, d.currency);
    if (words === d.amountMinor) {
      return pass(meta, `El monto en letras coincide con el número (${expected}).`, {
        observed,
        expected,
      });
    }
    return fail(
      meta,
      `En letras dice ${observed} («${d.x.amountInWords}»), pero en números ${expected}.`,
      'el monto en letras y en números coincidieran',
      { observed, expected },
    );
  },
);

export const addressedToUs = defineRule(
  {
    id: 'reading.addressed_to_us',
    stage: 'reading',
    title: 'Dirigida a la empresa',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.x) return skip(meta, 'Sin lectura del documento.', false);
    const org = d.ctx.organization;
    const { name, taxId } = d.x.billTo;
    if (!name && !taxId) return skip(meta, 'No indica a quién va dirigida.', true);
    const orgNames = [org.name, org.legalName, ...org.aliases].map(foldName);
    const taxMatches = taxId !== null && normalizeTaxId(taxId) === normalizeTaxId(org.taxId);
    const folded = name ? foldName(name) : '';
    const nameMatches =
      name !== null &&
      orgNames.some((n) => folded === n || folded.includes(n) || nameSimilarity(name, n) >= 0.92);
    if (taxMatches || nameMatches) {
      return pass(meta, endSentence(`Va dirigida a ${org.legalName}`), {
        observed: name ?? taxId,
        expected: org.legalName,
      });
    }
    return fail(
      meta,
      endSentence(`Va dirigida a «${name ?? taxId}», no a ${org.legalName}`),
      `estuviera dirigida a ${org.legalName}`,
      { observed: name ?? taxId, expected: org.legalName },
    );
  },
);

export const noAgentInstructions = defineRule(
  {
    id: 'reading.no_agent_instructions',
    stage: 'reading',
    title: 'Sin instrucciones para el agente',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    const scan = d.ctx.invoice.instructionScan;
    const quote = d.x?.agentInstructions.quote ?? scan.phrases[0] ?? null;
    if (d.agentInstructionsDetected) {
      return fail(
        meta,
        `El documento trae texto dirigido a un sistema automático${quote ? `: «${quote}»` : ''}. No sigo instrucciones que vienen dentro de las facturas.`,
        'la factura no incluyera instrucciones dirigidas al agente',
        { observed: quote },
      );
    }
    if (!d.x) return skip(meta, 'Sin lectura completa del documento.', false);
    return pass(meta, 'No trae instrucciones dirigidas al agente.');
  },
);

export const datesValid = defineRule(
  {
    id: 'dates.valid',
    stage: 'reading',
    title: 'Fechas válidas',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.issueDate) return skip(meta, 'Sin fecha de emisión válida.', false);
    const age = daysBetween(d.issueDate, d.decisionDate);
    if (age === null) return skip(meta, 'No pude interpretar las fechas.', false);
    if (age < -1) {
      return fail(
        meta,
        `La fecha de emisión (${formatDate(d.issueDate)}) es posterior a hoy (${formatDate(d.decisionDate)}).`,
        'la fecha de emisión no fuera futura',
        { observed: d.issueDate, expected: `≤ ${d.decisionDate}` },
      );
    }
    if (age > d.terms.maxInvoiceAgeDays) {
      return fail(
        meta,
        `La factura tiene ${age} días; el máximo para pagarla sola es ${d.terms.maxInvoiceAgeDays}.`,
        `la factura tuviera menos de ${d.terms.maxInvoiceAgeDays} días`,
        { observed: `${age} días`, expected: `≤ ${d.terms.maxInvoiceAgeDays} días` },
      );
    }
    if (d.dueDate && !d.dueDateDefaulted && d.dueDate < d.issueDate) {
      return fail(
        meta,
        `El vencimiento (${formatDate(d.dueDate)}) es anterior a la emisión (${formatDate(d.issueDate)}).`,
        'el vencimiento fuera posterior a la emisión',
        { observed: d.dueDate, expected: `≥ ${d.issueDate}` },
      );
    }
    const due = d.dueDate
      ? d.dueDateDefaulted
        ? `; sin vencimiento escrito, se asumen ${d.terms.defaultPaymentTermsDays} días (${formatDate(d.dueDate)})`
        : `; vence el ${formatDate(d.dueDate)}`
      : '';
    return pass(meta, `Emitida el ${formatDate(d.issueDate)}${due}.`, {
      observed: d.issueDate,
    });
  },
);

export const readingRules = [
  documentType,
  requiredFields,
  confidence,
  arithmetic,
  amountInWords,
  addressedToUs,
  noAgentInstructions,
  datesValid,
];

/** Exported for tests that build derived facts by hand. */
export type { Derived };
