import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUGUST } from './bills/agosto';
import { ATTACK_BILLS, ATTACKS } from './bills/ataques';
import { SEPTEMBER } from './bills/septiembre';
import { LIVE } from './bills/vivo';
import type { DatasetBill } from './types';

export * from './company';
export * from './types';
export { bill } from './bill';
export { SCRIPT, type ScriptAction } from './script';
export { AUGUST, SEPTEMBER, LIVE, ATTACKS, ATTACK_BILLS };
export type { Attack } from './bills/ataques';

/** The two scripted months, in order. */
export const MONTHS = [
  { period: '2026-08' as const, label: 'Agosto 2026', bills: AUGUST },
  { period: '2026-09' as const, label: 'Septiembre 2026', bills: SEPTEMBER },
];

export const ALL_BILLS: DatasetBill[] = [...AUGUST, ...SEPTEMBER, ...ATTACK_BILLS, ...LIVE];

export function findBill(id: string): DatasetBill {
  const found = ALL_BILLS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown dataset bill ${id}`);
  return found;
}

/**
 * Where the documents and recordings live: this package when running from source, or the copy
 * the API build places next to its bundle (dist/dataset). MANDATO_DATASET_DIR overrides both.
 */
function datasetRoot(): URL {
  const override = process.env.MANDATO_DATASET_DIR;
  if (override) return pathToFileURL(override.endsWith('/') ? override : `${override}/`);
  const candidates = ['../', './dataset/', '../dataset/'].map((p) => new URL(p, import.meta.url));
  return candidates.find((root) => existsSync(new URL('files/', root))) ?? candidates[0]!;
}

const ROOT = datasetRoot();

/** Absolute directory of the generated documents. */
export const FILES_DIR = fileURLToPath(new URL('files/', ROOT));
/** Absolute directory of recorded extractions (record/replay cache, ADR-0010). */
export const EXTRACTIONS_DIR = fileURLToPath(new URL('extractions/', ROOT));

export function filePath(bill: DatasetBill): string {
  return fileURLToPath(new URL(`files/${bill.file}`, ROOT));
}
