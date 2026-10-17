import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Container } from '../src/container';
import { invoices } from '../src/db/schema';
import {
  actOnApprovalLink,
  approveInvoice,
  createApprovalLink,
  resolveApprovalLink,
} from '../src/services/approvals';
import { DEMO_ORG_ID, ingestDatasetBill } from '../src/services/demo';
import { findBill } from '@mandato/dataset';
import { demoContainer, type FixedClock } from './helpers';

let container: Container & { clock: FixedClock };

async function escalated(id: string) {
  const bill = findBill(id);
  const result = await ingestDatasetBill(container.deps, bill, bill.receivedAt);
  const [row] = await container.deps.db
    .select()
    .from(invoices)
    .where(eq(invoices.id, result.invoiceId));
  expect(row?.status).toBe('PENDING_APPROVAL');
  return row!;
}

beforeAll(async () => {
  container = await demoContainer({ now: '2026-08-06T15:00:00Z' });
});
afterAll(() => container.database.close());

describe('approvals', () => {
  it('refuses approvals from people without approval rights', async () => {
    const invoice = await escalated('ago-09');
    await expect(
      approveInvoice(container.deps, {
        orgId: DEMO_ORG_ID,
        invoiceId: invoice.id,
        userId: 'usr_laura',
      }),
    ).rejects.toThrow(/no tiene permiso para aprobar/);
  });

  it('approves with one approver and proposes a signed exception', async () => {
    const [invoice] = await container.deps.db
      .select()
      .from(invoices)
      .where(eq(invoices.datasetId, 'ago-09'));
    const result = await approveInvoice(container.deps, {
      orgId: DEMO_ORG_ID,
      invoiceId: invoice!.id,
      userId: 'usr_martin',
      note: 'Retainer acordado',
    });
    expect(result.status).toBe('approved');
    expect(result.proposalId).not.toBeNull();
  });
});

describe('one-time signed approval links', () => {
  it('approves once and rejects replays, tampering and other approvers', async () => {
    const invoice = await escalated('ago-13');
    const link = await createApprovalLink(container.deps, {
      orgId: DEMO_ORG_ID,
      invoiceId: invoice.id,
      userId: 'usr_sofia',
    });
    expect(link.url).toMatch(/^http:\/\/localhost:3000\/aprobar\//);

    const resolved = await resolveApprovalLink(container.deps, link.token);
    expect(resolved.userName).toBe('Sofía Herrera');

    const [body, signature] = link.token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), u: 'usr_martin' })).toString('base64url')}.${signature}`;
    await expect(resolveApprovalLink(container.deps, forged)).rejects.toThrow(/no es válido/);

    const result = await actOnApprovalLink(
      container.deps,
      link.token,
      'approve',
      'Desde el celular',
    );
    expect(result.status).toBe('approved');
    await expect(actOnApprovalLink(container.deps, link.token, 'approve', null)).rejects.toThrow(
      /ya se usó/,
    );
  });

  it('expires', async () => {
    const invoice = await escalated('ago-17');
    const link = await createApprovalLink(container.deps, {
      orgId: DEMO_ORG_ID,
      invoiceId: invoice.id,
      userId: 'usr_martin',
    });
    container.clock.set('2026-08-30T15:00:00Z');
    await expect(actOnApprovalLink(container.deps, link.token, 'approve', null)).rejects.toThrow(
      /venció/,
    );
    container.clock.set('2026-08-06T15:00:00Z');
  });
});

describe('dual approval', () => {
  it('needs two different people', async () => {
    const invoice = await escalated('sep-16');
    const first = await approveInvoice(container.deps, {
      orgId: DEMO_ORG_ID,
      invoiceId: invoice.id,
      userId: 'usr_martin',
    });
    expect(first).toMatchObject({ status: 'pending', approvals: 1, required: 2 });
    await expect(
      approveInvoice(container.deps, {
        orgId: DEMO_ORG_ID,
        invoiceId: invoice.id,
        userId: 'usr_martin',
      }),
    ).rejects.toThrow(/se necesita otra persona/);
    const second = await approveInvoice(container.deps, {
      orgId: DEMO_ORG_ID,
      invoiceId: invoice.id,
      userId: 'usr_sofia',
    });
    expect(second.status).toBe('approved');
  });
});
