import { formatMoney, formatPeriodMonth, formatUsd, joinSpanish } from '../format';
import { CATEGORY_LABELS, defineRule, fail, pass, skip } from './helpers';

function amountWithUsd(amountMinor: number, currency: string, usdCents: number): string {
  return currency === 'USD'
    ? formatUsd(usdCents)
    : `${formatMoney(amountMinor, currency)} (≈ ${formatUsd(usdCents)})`;
}

export const currencyAllowed = defineRule(
  {
    id: 'policy.currency_allowed',
    stage: 'policy',
    title: 'Moneda permitida',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.currency) return skip(meta, 'Sin moneda identificada.', false);
    const allowed = d.terms.allowedCurrencies;
    if (allowed.includes(d.currency)) {
      return pass(meta, `${d.currency} es una moneda permitida.`, {
        observed: d.currency,
        expected: allowed.join(', '),
      });
    }
    return fail(
      meta,
      `La política no permite pagar en ${d.currency} (monedas permitidas: ${joinSpanish(allowed)}).`,
      `cobrara en una moneda permitida (${joinSpanish(allowed)})`,
      { observed: d.currency, expected: allowed.join(', ') },
    );
  },
);

export const autonomousLimit = defineRule(
  {
    id: 'policy.autonomous_limit',
    stage: 'policy',
    title: 'Límite por pago',
    onFail: 'ESCALATE',
    teachable: true,
  },
  (d, meta) => {
    if (d.usdCents === null || d.amountMinor === null || !d.currency) {
      return skip(meta, 'No pude convertir el monto a USD para compararlo con el límite.', false);
    }
    const limit = d.terms.autonomousLimitUsdCents;
    const override = d.mandate?.terms.autonomousLimitOverrideUsdCents ?? null;
    const amount = amountWithUsd(d.amountMinor, d.currency, d.usdCents);
    const expected = override
      ? `≤ ${formatUsd(Math.max(limit, override))}`
      : `≤ ${formatUsd(limit)}`;
    if (d.usdCents <= limit) {
      return pass(meta, `${amount} está dentro del límite por pago (${formatUsd(limit)}).`, {
        observed: formatUsd(d.usdCents),
        expected,
      });
    }
    if (override !== null && d.usdCents <= override) {
      return pass(
        meta,
        `${amount} supera el límite general (${formatUsd(limit)}), pero está dentro de la excepción firmada para ${d.payee?.name ?? 'este beneficiario'} (${formatUsd(override)}).`,
        { observed: formatUsd(d.usdCents), expected },
      );
    }
    const exception =
      override !== null ? `; la excepción firmada llega a ${formatUsd(override)}` : '';
    return fail(
      meta,
      `${amount} supera el límite por pago de ${formatUsd(limit)}${exception}.`,
      `el monto fuera de máximo ${formatUsd(Math.max(limit, override ?? 0))} o hubiera una excepción firmada para ${d.payee?.name ?? 'este beneficiario'}`,
      { observed: formatUsd(d.usdCents), expected },
    );
  },
);

export const periodBudget = defineRule(
  {
    id: 'policy.period_budget',
    stage: 'policy',
    title: 'Presupuesto del mes',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (d.usdCents === null)
      return skip(meta, 'Sin monto en USD no puedo revisar el presupuesto.', false);
    const budget = d.terms.monthlyBudgetUsdCents;
    const remaining = budget - d.committedUsdCents;
    const month = formatPeriodMonth(d.periodKey);
    const observed = formatUsd(d.committedUsdCents + d.usdCents);
    const expected = `≤ ${formatUsd(budget)}`;
    if (d.committedUsdCents + d.usdCents <= budget) {
      return pass(
        meta,
        `Quedan ${formatUsd(remaining)} del presupuesto de ${month}; esta factura usa ${formatUsd(d.usdCents)}.`,
        { observed, expected },
      );
    }
    return fail(
      meta,
      `El presupuesto de ${month} no alcanza: van ${formatUsd(d.committedUsdCents)} comprometidos de ${formatUsd(budget)} y esta factura suma ${formatUsd(d.usdCents)}.`,
      `quedaran al menos ${formatUsd(d.usdCents)} del presupuesto del mes (quedan ${formatUsd(Math.max(remaining, 0))})`,
      { observed, expected },
    );
  },
);

export const treasuryBalance = defineRule(
  {
    id: 'treasury.balance',
    stage: 'policy',
    title: 'Saldo disponible',
    onFail: 'HOLD',
    teachable: false,
  },
  (d, meta) => {
    if (d.usdCents === null)
      return skip(meta, 'Sin monto en USD no puedo revisar el saldo.', false);
    const available = d.ctx.treasury.availableUsdCents;
    if (available >= d.usdCents) {
      return pass(meta, `Hay saldo disponible (${formatUsd(available)}).`, {
        observed: formatUsd(d.usdCents),
        expected: `≤ ${formatUsd(available)}`,
      });
    }
    return fail(
      meta,
      `El saldo disponible (${formatUsd(available)}) no alcanza para ${formatUsd(d.usdCents)}.`,
      'hubiera saldo suficiente en la cuenta',
      { observed: formatUsd(d.usdCents), expected: `≤ ${formatUsd(available)}` },
    );
  },
);

export const requesterScope = defineRule(
  {
    id: 'requester.scope',
    stage: 'requester',
    title: 'Solicitante autorizado',
    onFail: 'HOLD',
    teachable: false,
  },
  (d, meta) => {
    const requester = d.ctx.requester;
    if (requester.kind === 'user') {
      return skip(meta, `La cargó ${requester.name}, del equipo.`, true);
    }
    if (requester.kind === 'system') return skip(meta, `La cargó ${requester.name}.`, true);
    const category = d.payee?.category ?? d.x?.category ?? null;
    const scope = requester.scope;
    const allowed = scope.categories.map((c) => CATEGORY_LABELS[c] ?? c);
    if (!category || !scope.categories.includes(category)) {
      return fail(
        meta,
        `El agente «${requester.name}» no tiene permiso para pagar ${category ? (CATEGORY_LABELS[category] ?? category) : 'esta categoría'} (puede: ${joinSpanish(allowed)}).`,
        `la pidiera una persona o un agente con permiso para ${category ? (CATEGORY_LABELS[category] ?? category) : 'esta categoría'}`,
        { observed: category, expected: scope.categories.join(', ') },
      );
    }
    if (d.usdCents === null)
      return skip(meta, 'Sin monto en USD no puedo revisar el permiso.', false);
    if (d.usdCents > scope.maxPerRequestUsdCents) {
      return fail(
        meta,
        `El agente «${requester.name}» puede pedir hasta ${formatUsd(scope.maxPerRequestUsdCents)} por pago; esta solicitud es de ${formatUsd(d.usdCents)}.`,
        `la solicitud fuera de máximo ${formatUsd(scope.maxPerRequestUsdCents)} o la hiciera una persona`,
        {
          observed: formatUsd(d.usdCents),
          expected: `≤ ${formatUsd(scope.maxPerRequestUsdCents)}`,
        },
      );
    }
    return pass(
      meta,
      `El agente «${requester.name}» tiene permiso para ${CATEGORY_LABELS[category] ?? category} hasta ${formatUsd(scope.maxPerRequestUsdCents)}.`,
    );
  },
);

export const policyRules = [currencyAllowed, autonomousLimit, periodBudget, treasuryBalance];
export const requesterRules = [requesterScope];
