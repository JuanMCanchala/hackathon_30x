import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OCTOBER_BILLS } from './bills/octubre';
import { SEPTEMBER_BILLS } from './bills/septiembre';
import type { BillSpec } from './bills/types';

export * from './bills/types';
export { COMPANY, DEMO_START } from './company';
export { CONTRACTS } from './contracts';
export { EVIDENCE, SCRIPTED_EVIDENCE } from './evidence';
export { FX } from './fx';
export { SCRIPT } from './script';
export { VENDORS } from './vendors';

/** Both months, in arrival order within each month. */
export const BILLS: BillSpec[] = [...SEPTEMBER_BILLS, ...OCTOBER_BILLS];

export function findBill(id: string): BillSpec {
  const found = BILLS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown dataset bill ${id}`);
  return found;
}

/** The milestone PR that is merged live on GitHub during the demo. */
export const LIVE_PR = {
  vendorId: 'andres-villasenor',
  contractId: 'ct-andres-villasenor',
  termId: 'villasenor-m3',
  repo: 'altamar-labs/app-movil',
  number: 3,
};

/** Its first October payment comes back from the bank (reconciliation demo). */
export const RETURNING_VENDOR_ID = 'cardumen-digital';

/**
 * Absolute path of the rendered documents: packages/dataset/files when running from source, or
 * the copy the API build places next to its bundle (apps/api/dist/dataset/files).
 */
export function filesDir(): string {
  const candidates = ['../files/', './dataset/files/', '../dataset/files/'].map(
    (p) => new URL(p, import.meta.url),
  );
  const found = candidates.find((u) => existsSync(u)) ?? candidates[0]!;
  return fileURLToPath(found).replace(/[\\/]$/, '');
}
