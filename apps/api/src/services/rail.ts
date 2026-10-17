/**
 * The payment rail behind an interface, and a deterministic simulation of Blinka's: the real API
 * is not public. Executing a payment writes the lines a bank statement would show: the USD debit
 * (with a small FX difference against the plan), the transfer fee where the rail charges one and,
 * for the one payment the dataset names, a return two days later.
 */
import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { RETURNING_BILL_ID } from '@recibido/dataset';
import { addDays, formatMoney, type BankLine, type Payment, type Rail } from '@recibido/domain';
import { bankLines, bills, payments } from '../db/schema';
import { withOrgLock } from './lock';
import { addTimeline, allVendors, ORG_ID, type Deps } from './state';

export interface PaymentRail {
  execute(payment: Payment, now: string): BankLine[];
}

const RAIL_LABEL: Record<Rail, string> = { 'bre-b': 'BRE-B', spei: 'SPEI', pix: 'PIX', ach: 'ACH' };
/** ±0,6 % in thousandths of a percent */
const MAX_DRIFT = 600;

/** A drift in [−600, +600] per 100.000, fixed by the payment id. */
function driftOf(paymentId: string): number {
  const n = createHash('sha256').update(paymentId).digest().readUInt32BE(0);
  return (n % (2 * MAX_DRIFT + 1)) - MAX_DRIFT;
}

export class SimulatedBlinkaRail implements PaymentRail {
  constructor(
    /** vendor id → name, as the statement prints it */
    private readonly vendorNames: Map<string, string>,
    /** the payment the simulated bank returns */
    private readonly returns: (payment: Payment) => boolean = () => false,
  ) {}

  execute(payment: Payment, now: string): BankLine[] {
    const date = now.slice(0, 10);
    const rail = RAIL_LABEL[payment.rail];
    const name = (this.vendorNames.get(payment.vendorId) ?? payment.vendorId).toUpperCase();
    const debit = Math.round(
      (payment.plan.usdDebitMinor * (100_000 + driftOf(payment.id))) / 100_000,
    );
    const lines: BankLine[] = [
      {
        id: `line-${payment.id}`,
        date,
        description: `${rail} ${payment.reference} ${name}`,
        amountUsdMinor: -debit,
        kind: 'debit',
      },
    ];
    if ((payment.rail === 'spei' || payment.rail === 'ach') && payment.plan.feeUsdMinor > 0)
      lines.push({
        id: `line-${payment.id}-fee`,
        date,
        description: `COMISION ${rail} ${payment.reference}`,
        amountUsdMinor: -payment.plan.feeUsdMinor,
        kind: 'fee',
      });
    if (this.returns(payment))
      lines.push({
        id: `line-${payment.id}-return`,
        date: addDays(date, 2),
        description: `DEVOLUCION ${rail} ${payment.reference} ${name}`,
        amountUsdMinor: debit,
        kind: 'return',
      });
    return lines;
  }
}

/** When a payment scheduled for `day` leaves: 10:00 Bogotá that day, or `now` if that is earlier. */
function executionTime(day: string, now: string): string {
  const due = `${day}T10:00:00-05:00`;
  return Date.parse(due) <= Date.parse(now) ? due : now;
}

/**
 * Executes every scheduled payment due on or before `now` through the simulated rail and stores
 * the statement lines. A returned payment no longer counts as paid; the bill keeps its status and
 * reconciliation flags the return.
 */
export async function executeDue(deps: Deps, now: string): Promise<Payment[]> {
  return withOrgLock(() =>
    deps.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orgId, ORG_ID), eq(payments.status, 'scheduled')))
        .orderBy(asc(payments.seq));
      const day = now.slice(0, 10);
      const ready = due.filter((r) => r.data.scheduledFor <= day);
      if (ready.length === 0) return [];

      const [returning] = await tx
        .select({ id: bills.id })
        .from(bills)
        .where(eq(bills.datasetId, RETURNING_BILL_ID));
      const returningPayment = returning
        ? (
            await tx
              .select()
              .from(payments)
              .where(eq(payments.billId, returning.id))
              .orderBy(asc(payments.seq))
              .limit(1)
          )[0]?.id
        : undefined;
      const names = new Map((await allVendors(tx)).map((v) => [v.id, v.name]));
      const rail = new SimulatedBlinkaRail(names, (p) => p.id === returningPayment);

      const executed: Payment[] = [];
      for (const row of ready) {
        const at = executionTime(row.data.scheduledFor, now);
        const lines = rail.execute(row.data, at);
        const status = lines.some((l) => l.kind === 'return') ? 'returned' : 'sent';
        const payment: Payment = { ...row.data, executedAt: at, status };
        await tx.update(payments).set({ data: payment, status }).where(eq(payments.id, row.id));
        await tx
          .insert(bankLines)
          .values(lines.map((l) => ({ id: l.id, orgId: ORG_ID, data: l })))
          .onConflictDoNothing();
        await addTimeline(
          tx,
          at,
          'payment',
          row.billId,
          `Pago ${payment.reference} enviado por ${RAIL_LABEL[payment.rail]}: ${formatMoney(payment.amountMinor, payment.currency)}.`,
        );
        if (status === 'returned')
          await addTimeline(
            tx,
            at,
            'payment',
            row.billId,
            `El banco devolvió el pago ${payment.reference}; queda marcado en la conciliación.`,
          );
        executed.push(payment);
      }
      return executed;
    }),
  );
}

/** The card charge on the October statement that no payment explains (flagged by design). */
export const UNMATCHED_CARD_LINE: BankLine = {
  id: 'line-card-cumbre-cloud',
  date: '2026-10-20',
  description: 'VISA *CUMBRE CLOUD',
  amountUsdMinor: -4900,
  kind: 'card',
};

export async function addStatementCardLine(deps: Deps): Promise<void> {
  await deps.db
    .insert(bankLines)
    .values({ id: UNMATCHED_CARD_LINE.id, orgId: ORG_ID, data: UNMATCHED_CARD_LINE })
    .onConflictDoNothing();
}
