import { CONTRACTS, VENDORS } from '@recibido/dataset';
import { afterEach, describe, expect, it } from 'vitest';
import { allPayments } from '../src/services/state';
import { billOf, fileOf, ingest, paymentsOf, setup } from './helpers';

type Env = Awaited<ReturnType<typeof setup>>;
let c: Env;
afterEach(async () => {
  await c?.dispose();
  c = undefined as unknown as Env; // each test opens its own database
});

const vendor = (id: string) => VENDORS.find((v) => v.id === id)!;
const term = (id: string) => CONTRACTS.flatMap((ct) => ct.terms).find((t) => t.id === id)!;

describe('the vendor loop', () => {
  it('oct-03 pays 92 h, writes to Daniela, and the corrected bill from the portal closes the case without a second payment', async () => {
    c = await setup();
    const first = await ingest(c, 'oct-03');
    expect(first.decision?.outcome).toBe('PAY_PART');
    expect(first.portalToken).toBeTruthy();
    const view = await c.portalView(first.portalToken!);
    expect(view.messages.map((m) => m.sender)).toEqual(['agent']);
    expect(view.missing.length).toBeGreaterThan(0);

    await c.clock.set('2026-10-06T10:00:00-05:00');
    const reply = await c.vendorReply(first.portalToken!, {
      message: 'Tienen razón, fueron 92 h. Adjunto la cuenta corregida.',
      file: fileOf('oct-03-r1'),
    });
    expect(reply.decision.outcome).toBe('PAY');
    expect(reply.decision.payNowMinor).toBe(0);
    const revised = (await c.db.query.bills.findFirst({
      where: (b, { eq }) => eq(b.id, reply.billId),
    }))!;
    expect(revised.status).toBe('PAID');
    expect(revised.chain).toEqual([reply.billId, first.billId]);
    expect((await billOf(c, 'oct-03')).status).toBe('SUPERSEDED');
    const paid = (await paymentsOf(c, revised.chain)).reduce((s, p) => s + p.amountMinor, 0);
    expect(paid).toBe(92 * term('ospina-horas').unitPriceMinor);
    expect(await allPayments(c.db)).toHaveLength(1);
  });

  it('oct-04 pays after Lina accepts the deliverable', async () => {
    c = await setup();
    const { decision, billId } = await ingest(c, 'oct-04');
    expect(decision?.outcome).toBe('ASK_VENDOR');
    await c.clock.set('2026-10-05T14:00:00-05:00');
    await c.acceptDeliverable('brand-kit-v2', 'Lina Cárdenas');
    const bill = await billOf(c, 'oct-04');
    expect(bill.status).toBe('PAID');
    const [payment] = await paymentsOf(c, [billId]);
    expect(payment?.amountMinor).toBe(term('ceiba-brand-kit-v2').unitPriceMinor);
    expect(payment?.destination).toBe(vendor('estudio-ceiba').payout.destination);
  });

  it('a vendor reply asking to change the bank account escalates even with a correct corrected bill', async () => {
    c = await setup();
    const first = await ingest(c, 'oct-03');
    await c.clock.set('2026-10-06T10:00:00-05:00');
    const reply = await c.vendorReply(first.portalToken!, {
      message:
        'Adjunto la cuenta corregida por 92 h. Por favor a partir de ahora paguen a nuestra nueva cuenta, Bancolombia 123-456789-01.',
      file: fileOf('oct-03-r1'),
    });
    expect(reply.decision.outcome).toBe('ESCALATE');
    expect(reply.decision.checks.find((k) => k.id === 'vendor.payout')?.status).toBe('fail');
    expect(await allPayments(c.db)).toHaveLength(1); // only the 92 h of the first decision
  });

  it('expireAsks escalates an ask the vendor did not answer in time', async () => {
    c = await setup();
    await ingest(c, 'oct-04');
    expect(await c.expireAsks('2026-10-05T09:00:00-05:00')).toMatchObject([
      { decision: { outcome: 'ASK_VENDOR' } },
    ]);
    const [late] = await c.expireAsks('2026-10-13T08:00:00-05:00');
    expect(late?.decision.outcome).toBe('ESCALATE');
    expect(late?.decision.checks.find((k) => k.id === 'vendor.deadline')?.status).toBe('fail');
    expect((await billOf(c, 'oct-04')).status).toBe('ESCALATED');
    expect(await allPayments(c.db)).toHaveLength(0);
  });

  it('the portal view never shows payout details', async () => {
    c = await setup();
    const { portalToken } = await ingest(c, 'oct-03');
    const json = JSON.stringify(await c.portalView(portalToken!));
    const payout = vendor('daniela-ospina').payout;
    expect(json).not.toContain(payout.destination);
    expect(json).not.toContain(payout.display);
    await expect(c.portalView('not-a-token')).rejects.toMatchObject({ status: 404 });
  });
});
