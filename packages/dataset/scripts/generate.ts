/**
 * Renders every dataset bill to packages/dataset/files (PDF, .eml, WhatsApp .txt).
 *
 *   pnpm dataset:generate
 *
 * Deterministic: the same dataset always produces the same bytes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BILLS, filesDir } from '../src';
import { renderBillFile } from '../src/render/render';

for (const bill of BILLS) {
  const target = join(filesDir(), bill.file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await renderBillFile(bill));
  console.log(`✓ ${bill.file}`);
}
