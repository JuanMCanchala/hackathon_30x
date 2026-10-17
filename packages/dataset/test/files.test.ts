import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BILLS, filesDir, findBill } from '../src';
import { formatMoney } from '../src/render/locale';
import { renderBillFile } from '../src/render/render';
import { documentText, pdfText } from './documents';

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const read = (file: string) => readFileSync(join(filesDir(), file));

describe('rendered dataset documents', () => {
  it('filesDir() holds one file per bill', () => {
    expect(existsSync(filesDir())).toBe(true);
    for (const b of BILLS) expect(existsSync(join(filesDir(), b.file)), b.file).toBe(true);
  });

  it('each PDF carries its invoice number and total in the vendor format', async () => {
    for (const b of BILLS.filter((x) => x.file.endsWith('.pdf'))) {
      const text = await pdfText(read(b.file));
      expect(text, b.id).toContain(b.truth.invoiceNumber!);
      expect(text, b.id).toContain(formatMoney(b.truth.total!, b.truth.currency as never));
    }
  });

  it('uses each country number format', () => {
    expect(formatMoney('18400000.00', 'COP')).toBe('$ 18.400.000');
    expect(formatMoney('12500.00', 'MXN')).toBe('$12,500.00');
    expect(formatMoney('4800.00', 'BRL')).toBe('R$ 4.800,00');
    expect(formatMoney('1200.00', 'USD')).toBe('$1,200.00');
  });

  it('the oct-06 e-mail body asks for the new Pix key', async () => {
    const eml = read(findBill('oct-06').file).toString('utf8');
    expect(eml).toContain('+55 11 98877-6655');
    expect(await documentText(findBill('oct-06'))).toContain('nova chave Pix +55 11 98877-6655');
  });

  it('the chat export is the transcript verbatim', () => {
    const b = findBill('oct-19');
    expect(read(b.file).toString('utf8')).toBe(`${b.body}\n`);
  });

  it('rendering is deterministic and the committed files are current', async () => {
    for (const b of BILLS) {
      const once = await renderBillFile(b);
      const twice = await renderBillFile(b);
      expect(sha(once), b.id).toBe(sha(twice));
      expect(sha(once), `${b.file} is stale: pnpm dataset:generate`).toBe(sha(read(b.file)));
    }
  });
});
