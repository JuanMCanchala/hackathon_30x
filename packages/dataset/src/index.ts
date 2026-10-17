import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

/**
 * The bill whose payment the simulated bank returns: Beatriz Lima's corrected September fatura,
 * paid over Pix. The return does not change the bill's labeled final status, which stays PAID;
 * reconciliation flags the returned bank line and links it to this bill.
 */
export const RETURNING_BILL_ID = 'oct-12-r1';

/**
 * Absolute path of the rendered documents: packages/dataset/files when running from source, or
 * the copy the API build places next to its bundle (apps/api/dist/dataset/files). When none
 * exists yet, the source location packages/dataset/files, never a path next to a bundle.
 */
export function filesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = ['../files', './dataset/files', '../dataset/files'].map((p) => join(here, p));
  const found = candidates.find((p) => existsSync(p));
  if (found) return found;
  // walk up to the workspace root that holds this package
  for (let dir = here; dirname(dir) !== dir; dir = dirname(dir)) {
    if (existsSync(join(dir, 'packages', 'dataset', 'package.json')))
      return join(dir, 'packages', 'dataset', 'files');
  }
  return candidates[0]!;
}
