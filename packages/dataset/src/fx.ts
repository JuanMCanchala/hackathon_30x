import type { FxSnapshot } from '@recibido/domain';

/** Simulated rates for both months: units of each currency per 1 USD. */
export const FX: FxSnapshot = {
  asOf: '2026-09-01',
  perUsd: { USD: '1', COP: '4150', MXN: '18.40', BRL: '5.45' },
};
