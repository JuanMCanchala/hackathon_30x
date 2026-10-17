/**
 * A person resolves what the engine escalated. Approving pays what the case still owes, and only
 * to the vendor's registered destination; nothing in the bill or a message changes that.
 */
import { eq } from 'drizzle-orm';
import { DEFAULT_POLICY, type ExtractedBill, type Payment } from '@recibido/domain';
import { bills, humanActions } from '../db/schema';
import { withOrgLock } from './lock';
import {
  addTimeline,
  casePaid,
  createPayment,
  getBill,
  lastDecision,
  newId,
  ORG_ID,
  ServiceError,
  type Deps,
} from './state';

export interface Resolution {
  action: 'approve' | 'reject';
  actor: string;
  note: string;
}

/** A person can only approve an amount the reader read: a total, its currency, confidently. */
function amountReadWithCertainty(reading: ExtractedBill | null | undefined): boolean {
  return (
    !!reading?.total?.trim() &&
    !!reading.currency?.trim() &&
    reading.confidence.total >= DEFAULT_POLICY.minReadingConfidence
  );
}

export async function resolveEscalation(
  deps: Deps,
  billId: string,
  { action, actor, note }: Resolution,
): Promise<{ status: 'APPROVED' | 'REJECTED'; payment: Payment | null }> {
  if (!actor.trim()) throw new ServiceError(400, 'Falta quién resuelve.');
  return withOrgLock(async () => {
    const now = await deps.clock.now();
    return deps.db.transaction(async (tx) => {
      const bill = await getBill(tx, billId);
      if (bill.status !== 'ESCALATED')
        throw new ServiceError(409, 'Solo se resuelven las cuentas escaladas a una persona.');
      let payment: Payment | null = null;
      const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
      if (action === 'approve') {
        if (!amountReadWithCertainty(bill.reading))
          throw new ServiceError(
            409,
            'No se puede aprobar: no se leyó con certeza el monto o la moneda. Pide la cuenta formal o recházala.',
          );
        const decision = await lastDecision(tx, billId);
        if (!decision) throw new ServiceError(409, 'La cuenta todavía no tiene una decisión.');
        const owed = decision.billedMinor - (await casePaid(tx, bill.chain));
        if (owed > 0)
          payment = await createPayment(tx, {
            bill,
            vendorId: decision.vendorId,
            contractId: decision.contractId,
            currency: decision.currency,
            amountMinor: owed,
            decidedBy: 'person',
            decisionId: null,
            now,
          });
      }
      await tx.insert(humanActions).values({
        id: newId('act'),
        orgId: ORG_ID,
        billId,
        at: now,
        actor,
        action,
        note: note.trim() || null,
      });
      await tx
        .update(bills)
        .set({ status, casePaidMinor: await casePaid(tx, bill.chain) })
        .where(eq(bills.id, billId));
      await addTimeline(
        tx,
        now,
        'human',
        billId,
        `${actor} ${action === 'approve' ? 'aprueba' : 'rechaza'} la cuenta${note.trim() ? `: ${note.trim()}` : '.'}`,
      );
      return { status, payment };
    });
  });
}
