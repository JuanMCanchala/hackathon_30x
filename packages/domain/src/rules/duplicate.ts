import { daysBetween } from '../dates';
import { formatDate, formatMoney } from '../format';
import type { HistoryInvoice } from '../types';
import { defineRule, fail, pass, payeeLabel, skip } from './helpers';

const STATUS_LABEL: Record<string, string> = {
  PAID: 'pagada',
  APPROVED: 'aprobada para pago',
  PENDING_APPROVAL: 'pendiente de aprobación',
};

function describe(h: HistoryInvoice): string {
  const status = STATUS_LABEL[h.status] ?? h.status.toLowerCase();
  return `${status} (${h.ref}, ${formatDate(h.decidedAt.slice(0, 10))})`;
}

export const duplicateNumber = defineRule(
  {
    id: 'duplicate.invoice_number',
    stage: 'duplicate',
    title: 'No está duplicada',
    onFail: 'HOLD',
    teachable: false,
  },
  (d, meta) => {
    if (!d.invoiceNumberNorm) {
      return skip(meta, 'Sin número de factura no puedo descartar duplicados.', false);
    }
    const number = d.x?.invoiceNumber ?? d.invoiceNumberNorm;
    const duplicate = d.issuerActive.find((h) => h.invoiceNumberNorm === d.invoiceNumberNorm);
    if (duplicate) {
      return fail(
        meta,
        `La factura ${number} de ${payeeLabel(d)} ya está ${describe(duplicate)}.`,
        'fuera un cobro distinto (otro número de factura)',
        { observed: number, expected: `distinto de ${duplicate.invoiceNumber ?? duplicate.ref}` },
      );
    }
    return pass(meta, `No hay otra factura ${number} de este emisor pagada ni pendiente.`);
  },
);

export const duplicateAmount = defineRule(
  {
    id: 'duplicate.same_amount_recent',
    stage: 'duplicate',
    title: 'Sin cobro repetido',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.currency || d.amountMinor === null) {
      return skip(meta, 'Sin monto no puedo buscar cobros repetidos.', false);
    }
    const window = d.terms.duplicateWindowDays;
    const servicePeriod = d.x?.servicePeriod ?? null;
    const samePeriod = (h: HistoryInvoice) => {
      if (servicePeriod && h.servicePeriod) return servicePeriod === h.servicePeriod;
      if (d.issueDate && h.issueDate) {
        const gap = daysBetween(h.issueDate, d.issueDate);
        return gap !== null && Math.abs(gap) <= window;
      }
      return false;
    };
    const repeated = d.issuerActive.find(
      (h) =>
        h.currency === d.currency &&
        h.amountMinor === d.amountMinor &&
        h.invoiceNumberNorm !== d.invoiceNumberNorm &&
        samePeriod(h),
    );
    const amount = formatMoney(d.amountMinor, d.currency);
    if (repeated) {
      return fail(
        meta,
        `Ya hay otro cobro de ${payeeLabel(d)} por ${amount} del mismo periodo: ${repeated.invoiceNumber ?? 'sin número'}, ${describe(repeated)}.`,
        'no hubiera otro cobro por el mismo monto en el mismo periodo',
        { observed: amount, expected: 'un solo cobro por periodo' },
      );
    }
    return pass(meta, `No hay otro cobro de ${amount} de este emisor en el mismo periodo.`);
  },
);

export const duplicateRules = [duplicateNumber, duplicateAmount];
