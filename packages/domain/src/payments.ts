import { addDays, daysBetween } from './dates';
import { convertToUsdMinor, formatMoney } from './money';
import type { Contract, Currency, FxSnapshot, Rail } from './types';

export interface RailAssumptions {
  annualYieldBps: number;
  railFeeUsdMinor: Record<Rail, number>;
  railSpreadBps: Record<Rail, number>;
  wireFeeUsdMinor: number;
  wireSpreadBps: number;
  text: string;
}

export const DEFAULT_ASSUMPTIONS: RailAssumptions = {
  annualYieldBps: 400,
  railFeeUsdMinor: { 'bre-b': 0, spei: 50, pix: 0, ach: 25 },
  railSpreadBps: { 'bre-b': 35, spei: 35, pix: 35, ach: 0 },
  wireFeeUsdMinor: 3500,
  wireSpreadBps: 250,
  text:
    'Supuestos simulados para la demo: el dinero rinde 4,0 % anual en un fondo de mercado monetario; ' +
    'Bre-B, SPEI y Pix cobran un margen cambiario de 0,35 %; ACH no cobra margen; ' +
    'una transferencia internacional (wire) cuesta USD 35,00 más 2,5 % de margen.',
};

const RAILS: Record<Currency, Rail> = { COP: 'bre-b', MXN: 'spei', BRL: 'pix', USD: 'ach' };
export function railFor(currency: Currency): Rail {
  return RAILS[currency];
}

export interface PaymentPlan {
  rail: Rail;
  payOn: string;
  reason: string;
  amountMinor: number;
  discountMinor: number;
  usdDebitMinor: number;
  feeUsdMinor: number;
  wireCostUsdMinor: number;
  feesSavedUsdMinor: number;
  yieldKeptUsdMinor: number;
}

export interface Payment {
  id: string;
  billId: string;
  vendorId: string;
  contractId: string | null;
  amountMinor: number;
  currency: Currency;
  destination: string;
  rail: Rail;
  decidedBy: 'agent' | 'person';
  decisionId: string | null;
  scheduledFor: string;
  executedAt: string | null;
  status: 'scheduled' | 'sent' | 'returned';
  plan: PaymentPlan;
  reference: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function shortDate(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ''}`;
}

const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;

/** Yield on `usdMinor` over `days`, rounded down (we never overstate what the money earns). */
function yieldOn(usdMinor: number, bps: number, days: number): number {
  if (days <= 0) return 0;
  return Number((BigInt(usdMinor) * BigInt(bps) * BigInt(days)) / (365n * 10_000n));
}

export function planPayment(input: {
  amountMinor: number;
  currency: Currency;
  issueDate: string;
  dueDate: string | null;
  contract: Contract;
  today: string;
  fx: FxSnapshot;
  assumptions?: RailAssumptions;
}): PaymentPlan {
  const a = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const { amountMinor, currency, contract, fx } = input;
  const today = input.today.slice(0, 10);
  const rail = railFor(currency);
  const due =
    input.dueDate && input.dueDate >= input.issueDate
      ? input.dueDate
      : addDays(input.issueDate, contract.netDays);
  const usdFull = convertToUsdMinor(amountMinor, currency, fx);

  let payOn = due;
  let discountMinor = 0;
  let reason: string;
  const early = contract.earlyPayment;
  // the discount window may outlast the due date; we never pay after the due date for it
  const window = early ? addDays(input.issueDate, early.withinDays) : null;
  const deadline = window && window > due ? due : window;
  if (early && deadline && deadline >= today) {
    const discountUsd = Number((BigInt(usdFull) * BigInt(early.discountBps)) / 10_000n);
    const yieldLost = yieldOn(usdFull, a.annualYieldBps, daysBetween(deadline, due));
    const pct = `${(early.discountBps / 100).toString().replace('.', ',')} %`;
    if (discountUsd > yieldLost) {
      payOn = deadline;
      discountMinor = Number((BigInt(amountMinor) * BigInt(early.discountBps)) / 10_000n);
      reason =
        `Pagamos el ${shortDate(payOn, true)} para aprovechar el descuento por pronto pago (${pct}): ` +
        `vale ${formatMoney(discountUsd, 'USD')} y mantener el dinero en el fondo hasta el ` +
        `${shortDate(due, true)} rendiría ${formatMoney(yieldLost, 'USD')}.`;
    } else {
      reason =
        `Pagamos el ${shortDate(due, true)}, en la fecha de vencimiento: el descuento por pronto pago (${pct}) ` +
        `vale ${formatMoney(discountUsd, 'USD')} y mantener el dinero en el fondo rinde ${formatMoney(yieldLost, 'USD')}.`;
    }
  } else {
    reason = `Pagamos el ${shortDate(due, true)}, en la fecha de vencimiento.`;
  }
  if (payOn < today) {
    payOn = today;
    reason = `Pagamos hoy, ${shortDate(today, true)}: la fecha de vencimiento (${shortDate(due, true)}) ya pasó.`;
  }

  const usd = convertToUsdMinor(amountMinor - discountMinor, currency, fx);
  const usdDebitMinor = Number(
    ceilDiv(BigInt(usd) * (10_000n + BigInt(a.railSpreadBps[rail])), 10_000n),
  );
  const spreadCost = usdDebitMinor - usd;
  const feeUsdMinor = a.railFeeUsdMinor[rail];
  const wireCostUsdMinor =
    a.wireFeeUsdMinor + Number(ceilDiv(BigInt(usd) * BigInt(a.wireSpreadBps), 10_000n));

  return {
    rail,
    payOn,
    reason,
    amountMinor,
    discountMinor,
    usdDebitMinor,
    feeUsdMinor,
    wireCostUsdMinor,
    feesSavedUsdMinor: wireCostUsdMinor - (feeUsdMinor + spreadCost),
    yieldKeptUsdMinor: yieldOn(usdDebitMinor, a.annualYieldBps, daysBetween(today, payOn)),
  };
}
