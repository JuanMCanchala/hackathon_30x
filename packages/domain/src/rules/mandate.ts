import { formatDate, formatMoney, formatPeriodMonth, plural } from '../format';
import { toleranceBounds } from '../money';
import type { MandateTerms } from '../schemas';
import { defineRule, fail, pass, skip } from './helpers';

export function describeMandateAmount(terms: MandateTerms): string {
  const a = terms.amount;
  if (a.kind === 'up_to') return `hasta ${formatMoney(a.maxMinor, terms.currency)} por factura`;
  if (a.tolerancePct === 0) return `${formatMoney(a.amountMinor, terms.currency)} por factura`;
  const { min, max } = toleranceBounds(a.amountMinor, a.tolerancePct);
  return `${formatMoney(a.amountMinor, terms.currency)} ± ${a.tolerancePct} % (${formatMoney(min, terms.currency)} a ${formatMoney(max, terms.currency)})`;
}

export function describeMandate(terms: MandateTerms): string {
  return `${describeMandateAmount(terms)}, ${plural(terms.maxInvoicesPerPeriod, 'factura')} y tope de ${formatMoney(terms.periodCapMinor, terms.currency)} al mes`;
}

export const mandateExists = defineRule(
  {
    id: 'mandate.exists',
    stage: 'mandate',
    title: 'Hay un acuerdo firmado',
    onFail: 'ESCALATE',
    teachable: true,
  },
  (d, meta) => {
    if (!d.payee) {
      return skip(meta, 'Sin beneficiario registrado no hay acuerdo que aplicar.', false);
    }
    const name = d.payee.name;
    if (d.mandate) {
      const signers = d.mandate.signedBy.map((s) => s.name).join(' y ');
      return pass(
        meta,
        `Hay un acuerdo firmado con ${name} (versión ${d.mandate.version}, firmado por ${signers}).`,
        { observed: `v${d.mandate.version}` },
      );
    }
    if (d.mandateOutOfWindow) {
      const t = d.mandateOutOfWindow.terms;
      const when =
        t.validFrom > d.decisionDate
          ? `empieza a regir el ${formatDate(t.validFrom)}`
          : `venció el ${formatDate(t.validUntil ?? t.validFrom)}`;
      return fail(
        meta,
        `El acuerdo con ${name} ${when}.`,
        `el acuerdo con ${name} estuviera vigente`,
      );
    }
    return fail(
      meta,
      `No hay un acuerdo firmado con ${name} que permita pagarle sin aprobación.`,
      `hubiera un acuerdo firmado con ${name} que cubra este cobro`,
    );
  },
);

export const mandateCurrency = defineRule(
  {
    id: 'mandate.currency',
    stage: 'mandate',
    title: 'Moneda acordada',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.mandate) return skip(meta, 'No aplica: no hay acuerdo vigente.', false);
    if (!d.currency) return skip(meta, 'Sin moneda no puedo compararla con el acuerdo.', false);
    const agreed = d.mandate.terms.currency;
    if (d.currency === agreed) {
      return pass(meta, `Cobra en ${d.currency}, la moneda acordada.`, {
        observed: d.currency,
        expected: agreed,
      });
    }
    return fail(
      meta,
      `Cobra en ${d.currency}, pero el acuerdo es en ${agreed}.`,
      `cobrara en ${agreed}, como dice el acuerdo`,
      { observed: d.currency, expected: agreed },
    );
  },
);

export const mandateAmount = defineRule(
  {
    id: 'mandate.amount',
    stage: 'mandate',
    title: 'Monto acordado',
    onFail: 'ESCALATE',
    teachable: true,
  },
  (d, meta) => {
    if (!d.mandate) return skip(meta, 'No aplica: no hay acuerdo vigente.', false);
    const terms = d.mandate.terms;
    if (d.amountMinor === null || d.currency !== terms.currency) {
      return skip(
        meta,
        'No puedo comparar el monto con el acuerdo (moneda o monto distintos).',
        false,
      );
    }
    const observed = formatMoney(d.amountMinor, terms.currency);
    const expected = describeMandateAmount(terms);
    const a = terms.amount;
    let ok: boolean;
    let remedy: string;
    if (a.kind === 'up_to') {
      ok = d.amountMinor <= a.maxMinor;
      remedy = `el monto fuera de máximo ${formatMoney(a.maxMinor, terms.currency)}`;
    } else {
      const { min, max } = toleranceBounds(a.amountMinor, a.tolerancePct);
      ok = d.amountMinor >= min && d.amountMinor <= max;
      remedy =
        min === max
          ? `el monto fuera ${formatMoney(a.amountMinor, terms.currency)}, como dice el acuerdo`
          : `el monto estuviera entre ${formatMoney(min, terms.currency)} y ${formatMoney(max, terms.currency)}`;
    }
    if (ok)
      return pass(meta, `Cobra ${observed}; el acuerdo dice ${expected}.`, { observed, expected });
    return fail(meta, `Cobra ${observed}, pero el acuerdo dice ${expected}.`, remedy, {
      observed,
      expected,
    });
  },
);

export const mandateFrequency = defineRule(
  {
    id: 'mandate.frequency',
    stage: 'mandate',
    title: 'Frecuencia acordada',
    onFail: 'ESCALATE',
    teachable: true,
  },
  (d, meta) => {
    if (!d.mandate || !d.payee) return skip(meta, 'No aplica: no hay acuerdo vigente.', false);
    const max = d.mandate.terms.maxInvoicesPerPeriod;
    const nth = d.issuerMonth.length + 1;
    const month = formatPeriodMonth(d.periodKey);
    const observed = `${nth}.ª factura en ${month}`;
    const expected = `máximo ${plural(max, 'factura')} al mes`;
    if (nth <= max) {
      return pass(meta, `Es la factura ${nth} de ${max} permitidas en ${month}.`, {
        observed,
        expected,
      });
    }
    const others = d.issuerMonth.map((h) => h.ref).join(', ');
    return fail(
      meta,
      `Sería la factura n.º ${nth} de ${d.payee.name} en ${month} (ya están ${others}); el acuerdo permite ${plural(max, 'factura')} al mes.`,
      max === 1
        ? 'fuera la única factura del mes, como dice el acuerdo'
        : `no hubiera más de ${max} facturas en el mes`,
      { observed, expected },
    );
  },
);

export const mandatePeriodCap = defineRule(
  {
    id: 'mandate.period_cap',
    stage: 'mandate',
    title: 'Tope mensual del acuerdo',
    onFail: 'ESCALATE',
    teachable: true,
  },
  (d, meta) => {
    if (!d.mandate || !d.payee) return skip(meta, 'No aplica: no hay acuerdo vigente.', false);
    const terms = d.mandate.terms;
    if (d.amountMinor === null || d.currency !== terms.currency) {
      return skip(meta, 'No puedo sumar contra el tope (moneda o monto distintos).', false);
    }
    const total = d.issuerMonthAmountMinor + d.amountMinor;
    const month = formatPeriodMonth(d.periodKey);
    const observed = formatMoney(total, terms.currency);
    const expected = `≤ ${formatMoney(terms.periodCapMinor, terms.currency)}`;
    if (total <= terms.periodCapMinor) {
      return pass(
        meta,
        `Con esta factura, ${d.payee.name} suma ${observed} en ${month}, dentro del tope de ${formatMoney(terms.periodCapMinor, terms.currency)}.`,
        { observed, expected },
      );
    }
    return fail(
      meta,
      `Con esta factura, ${d.payee.name} sumaría ${observed} en ${month}; el tope mensual del acuerdo es ${formatMoney(terms.periodCapMinor, terms.currency)}.`,
      `lo cobrado en el mes no pasara de ${formatMoney(terms.periodCapMinor, terms.currency)}`,
      { observed, expected },
    );
  },
);

export const mandateRules = [
  mandateExists,
  mandateCurrency,
  mandateAmount,
  mandateFrequency,
  mandatePeriodCap,
];
