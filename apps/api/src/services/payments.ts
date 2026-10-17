/**
 * Paying decided bills (ADR-0018). A bill the agent paid, or a person approved, gets a transfer
 * scheduled for its due date, to the payee's *registered* destination, through the matching
 * rail. Running payments sends what is due and settles what has arrived. The rail here is
 * simulated; a real one plugs in behind the same calls.
 */
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import {
  RAILS,
  expectedSettlement,
  localDate,
  paymentDate,
  transferReference,
  type Payee,
} from '@mandato/domain';
import type { Executor, Tx } from '../db/client';
import { invoices, organizations, payees, payments } from '../db/schema';
import { newId } from '../lib/common';
import type { Deps } from './deps';
import { withOrgLock } from './deps';
import { appendLedger, SYSTEM_ACTOR, type LedgerAppend } from './ledger';

type InvoiceRow = typeof invoices.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

/**
 * Schedules the transfer for a bill that was just paid or approved. Returns the ledger entries
 * to append with the decision, or none when there is nothing safe to pay (no registered,
 * active payee or no amount): approving a bill never invents a destination.
 */
export async function schedulePayment(
  tx: Tx,
  invoice: Pick<
    InvoiceRow,
    'id' | 'orgId' | 'ref' | 'payeeId' | 'amountMinor' | 'currency' | 'usdCents' | 'dueDate'
  >,
  at: string,
): Promise<LedgerAppend[]> {
  if (!invoice.payeeId || invoice.amountMinor === null || !invoice.currency) return [];
  const [row] = await tx.select().from(payees).where(eq(payees.id, invoice.payeeId));
  const payee: Payee | undefined = row?.data;
  if (!payee || payee.status !== 'active') return [];
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, invoice.orgId));
  const decidedOn = localDate(at, org?.timeZone ?? 'UTC');
  const id = newId('pmt');
  const scheduledFor = paymentDate(invoice.dueDate, decidedOn);
  await tx.insert(payments).values({
    id,
    orgId: invoice.orgId,
    invoiceId: invoice.id,
    payeeId: payee.id,
    rail: payee.destination.method,
    destination: payee.destination.value,
    currency: invoice.currency,
    amountMinor: invoice.amountMinor,
    usdCents: invoice.usdCents,
    scheduledFor,
    status: 'scheduled',
    createdAt: new Date(at),
  });
  return [
    {
      type: 'PAYMENT_SCHEDULED',
      entityId: invoice.id,
      actor: SYSTEM_ACTOR,
      at,
      payload: {
        paymentId: id,
        invoiceId: invoice.id,
        ref: invoice.ref,
        payeeId: payee.id,
        rail: payee.destination.method,
        destination: payee.destination.value,
        currency: invoice.currency,
        amountMinor: invoice.amountMinor,
        usdCents: invoice.usdCents,
        scheduledFor,
      },
    },
  ];
}

/**
 * Sends every transfer due by `at` and settles those whose rail has delivered them. Returns how
 * many moved, so the caller can tell people.
 */
export async function runPayments(
  deps: Deps,
  orgId: string,
  at: string,
): Promise<{ sent: number; settled: number }> {
  const result = await withOrgLock(deps.db, orgId, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
    const today = localDate(at, org?.timeZone ?? 'UTC');
    const due = await tx
      .select({ payment: payments, ref: invoices.ref })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(payments.orgId, orgId),
          inArray(payments.status, ['scheduled', 'sent']),
          lte(payments.scheduledFor, today),
        ),
      )
      .orderBy(asc(payments.scheduledFor), asc(payments.createdAt));
    const entries: LedgerAppend[] = [];
    let sent = 0;
    let settled = 0;
    for (const { payment, ref } of due) {
      let current = payment;
      if (current.status === 'scheduled') {
        // The money follows the registry as it is today: a verified change of account applies,
        // and a blocked payee is not paid.
        const [registered] = await tx.select().from(payees).where(eq(payees.id, current.payeeId));
        if (!registered || registered.data.status !== 'active') continue;
        const destination = registered.data.destination;
        if (destination.value !== current.destination || destination.method !== current.rail) {
          await tx
            .update(payments)
            .set({ destination: destination.value, rail: destination.method })
            .where(eq(payments.id, current.id));
          current = { ...current, destination: destination.value, rail: destination.method };
        }
        const rail = RAILS[current.rail];
        const sentOn = current.scheduledFor;
        const reference = transferReference(rail, ref, sentOn);
        const expected = expectedSettlement(rail, sentOn);
        await tx
          .update(payments)
          .set({ status: 'sent', reference, expectedSettlement: expected, sentAt: new Date(at) })
          .where(eq(payments.id, current.id));
        entries.push({
          type: 'PAYMENT_SENT',
          entityId: current.invoiceId,
          actor: SYSTEM_ACTOR,
          at,
          payload: {
            paymentId: current.id,
            invoiceId: current.invoiceId,
            ref,
            payeeId: current.payeeId,
            rail: current.rail,
            destination: current.destination,
            currency: current.currency,
            amountMinor: current.amountMinor,
            reference,
            expectedSettlement: expected,
          },
        });
        sent++;
        current = { ...current, status: 'sent', reference, expectedSettlement: expected };
      }
      if (
        current.status === 'sent' &&
        current.expectedSettlement &&
        current.expectedSettlement <= today
      ) {
        await tx
          .update(payments)
          .set({ status: 'settled', settledAt: new Date(at) })
          .where(eq(payments.id, current.id));
        entries.push({
          type: 'PAYMENT_SETTLED',
          entityId: current.invoiceId,
          actor: SYSTEM_ACTOR,
          at,
          payload: {
            paymentId: current.id,
            invoiceId: current.invoiceId,
            ref,
            reference: current.reference ?? '',
          },
        });
        settled++;
      }
    }
    await appendLedger(tx, orgId, entries);
    return { sent, settled };
  });
  if (result.sent || result.settled) {
    deps.bus.publish({ type: 'payment.updated', orgId, at, data: result });
  }
  return result;
}

export interface PaymentView {
  id: string;
  invoiceId: string;
  ref: string;
  title: string | null;
  payeeName: string;
  rail: PaymentRow['rail'];
  railName: string;
  destination: string;
  currency: string;
  amountMinor: number;
  usdCents: number | null;
  scheduledFor: string;
  status: PaymentRow['status'];
  reference: string | null;
  expectedSettlement: string | null;
  sentAt: string | null;
  settledAt: string | null;
}

export async function listPayments(db: Executor, orgId: string): Promise<PaymentView[]> {
  const rows = await db
    .select({ payment: payments, ref: invoices.ref, title: invoices.title, payee: payees.data })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(payees, eq(payees.id, payments.payeeId))
    .where(eq(payments.orgId, orgId))
    .orderBy(desc(payments.scheduledFor), desc(payments.createdAt));
  return rows.map(({ payment: p, ref, title, payee }) => toView(p, ref, title, payee.name));
}

export async function paymentForInvoice(
  db: Executor,
  invoiceId: string,
): Promise<PaymentView | null> {
  const [row] = await db
    .select({ payment: payments, ref: invoices.ref, title: invoices.title, payee: payees.data })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(payees, eq(payees.id, payments.payeeId))
    .where(eq(payments.invoiceId, invoiceId));
  return row ? toView(row.payment, row.ref, row.title, row.payee.name) : null;
}

function toView(p: PaymentRow, ref: string, title: string | null, payeeName: string): PaymentView {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    ref,
    title,
    payeeName,
    rail: p.rail,
    railName: RAILS[p.rail].name,
    destination: p.destination,
    currency: p.currency,
    amountMinor: p.amountMinor,
    usdCents: p.usdCents,
    scheduledFor: p.scheduledFor,
    status: p.status,
    reference: p.reference,
    expectedSettlement: p.expectedSettlement,
    sentAt: p.sentAt?.toISOString() ?? null,
    settledAt: p.settledAt?.toISOString() ?? null,
  };
}
