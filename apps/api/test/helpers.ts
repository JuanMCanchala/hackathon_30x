/** Test harness: an in-memory PGlite with Altamar Labs seeded, and dataset bills by id. */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { filesDir, findBill, SCRIPT, type ScriptStep } from '@recibido/dataset';
import type { Payment } from '@recibido/domain';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { createContainer, type Container, type ContainerOverrides } from '../src/container';
import { openDatabase } from '../src/db/client';
import { bills, decisions } from '../src/db/schema';
import { allPayments } from '../src/services/state';

export async function setup(
  env: Record<string, string> = {},
  overrides: Omit<ContainerOverrides, 'db'> = {},
): Promise<Container & { dispose: () => Promise<void> }> {
  const database = await openDatabase({});
  const config = loadConfig({ READER: 'reference', LLM_PROVIDER: 'none', ...env });
  const c = await createContainer(config, { ...overrides, db: database.db });
  await c.seed();
  return { ...c, dispose: database.close };
}

const ALL_STEPS = [...SCRIPT.septiembre, ...SCRIPT.octubre];

/** When the script delivers a bill (its arrival or the reply that carries it). */
export function arrivalOf(datasetId: string): string {
  const step = ALL_STEPS.find(
    (s) =>
      (s.type === 'bill' && s.billId === datasetId) ||
      (s.type === 'vendor_reply' && s.replyBillId === datasetId),
  );
  if (!step) throw new Error(`${datasetId} is not in the script`);
  return step.at;
}

export function fileOf(datasetId: string): { bytes: Uint8Array; filename: string } {
  const spec = findBill(datasetId);
  return { bytes: readFileSync(join(filesDir(), spec.file)), filename: basename(spec.file) };
}

/** Delivers a dataset bill at `at` (default: when the script does). */
export async function ingest(c: Container, datasetId: string, at = arrivalOf(datasetId)) {
  await c.clock.set(at);
  return c.ingestDocument({ ...fileOf(datasetId), receivedAt: at, datasetId });
}

export async function billOf(c: Container, datasetId: string) {
  const [bill] = await c.db.select().from(bills).where(eq(bills.datasetId, datasetId));
  if (!bill) throw new Error(`${datasetId} was not ingested`);
  return bill;
}

export async function decisionsOf(c: Container, billId: string) {
  const rows = await c.db.select().from(decisions).where(eq(decisions.billId, billId));
  return rows.sort((a, b) => a.seq - b.seq).map((r) => r.data);
}

export async function paymentsOf(c: Container, billIds: string[]): Promise<Payment[]> {
  return (await allPayments(c.db)).filter((p) => billIds.includes(p.billId));
}

/** Runs script steps through the services, the way the demo's step runner will. */
export async function runSteps(c: Container, steps: ScriptStep[]): Promise<void> {
  for (const step of steps) {
    await c.clock.set(step.at);
    switch (step.type) {
      case 'bill':
        await ingest(c, step.billId, step.at);
        break;
      case 'vendor_reply': {
        const token = await c.createPortalToken((await billOf(c, step.billId)).id);
        const file = step.replyBillId ? fileOf(step.replyBillId) : undefined;
        await c.vendorReply(token, { message: step.message, file, datasetId: step.replyBillId });
        break;
      }
      case 'evidence':
        await c.addEvidence([step.item]);
        break;
      case 'human':
        await c.resolveEscalation((await billOf(c, step.billId)).id, step);
        break;
      case 'clock':
        await c.expireAsks(step.to);
        break;
    }
  }
}
