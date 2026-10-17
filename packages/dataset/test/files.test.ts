import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_BILLS, filePath, scanForAgentInstructionsInDataset } from './support';

describe('generated documents', () => {
  it.each(ALL_BILLS.map((b) => [b.file, b] as const))('%s exists', (_file, bill) => {
    expect(existsSync(filePath(bill)), `run: pnpm dataset:generate ${bill.id}`).toBe(true);
  });

  it('chats and e-mails only trigger the instruction scanner where intended', () => {
    const flagged = scanForAgentInstructionsInDataset();
    expect(flagged).toEqual([]);
  });

  it('prints every ground-truth invoice number in text documents', () => {
    for (const bill of ALL_BILLS.filter((b) => b.document.format === 'txt')) {
      const text = readFileSync(filePath(bill), 'utf8');
      expect(text).toContain(bill.truth.invoiceNumber!);
    }
  });
});
