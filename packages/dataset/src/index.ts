import { fileURLToPath } from 'node:url';
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

/** Absolute directory of the generated documents. */
export const FILES_DIR = fileURLToPath(new URL('../files/', import.meta.url));
/** Absolute directory of recorded extractions (record/replay cache, ADR-0010). */
export const EXTRACTIONS_DIR = fileURLToPath(new URL('../extractions/', import.meta.url));

export function filePath(bill: DatasetBill): string {
  return fileURLToPath(new URL(`../files/${bill.file}`, import.meta.url));
}
