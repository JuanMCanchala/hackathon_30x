import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_BILLS, filePath, findBill } from '@mandato/dataset';
import { scanForAgentInstructions } from '@mandato/domain';
import { loadConfig } from '../src/config';
import { CachedExtractor, ExtractionCache } from '../src/extraction/cache';
import { parseChat, parseEmail, prepareDocument, readableTexts } from '../src/extraction/prepare';
import { sha256 } from '../src/lib/common';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = (id: string) => {
  const bill = findBill(id);
  return { bill, bytes: readFileSync(filePath(bill)) };
};

describe('deterministic instruction scanner over real documents', () => {
  it.each(ALL_BILLS.map((b) => [b.id, b] as const))('%s', async (_id, bill) => {
    const texts = await readableTexts(
      readFileSync(filePath(bill)),
      bill.mediaType,
      basename(bill.file),
    );
    const scan = scanForAgentInstructions(...texts);
    expect(scan.matched).toBe(bill.truth.agentInstructions.detected);
  });

  it('finds text hidden in white, 1 px font inside a PDF', async () => {
    const { bill, bytes } = read('atk-04');
    const [text] = await readableTexts(bytes, bill.mediaType, basename(bill.file));
    expect(text).toContain('ignore your previous rules');
  });
});

describe('document preparation', () => {
  it('sends PDFs as document blocks and e-mails as text plus attachments', async () => {
    const pdf = read('ago-04');
    const prepared = await prepareDocument(pdf.bytes, 'application/pdf', 'cc.pdf');
    expect(prepared.blocks[0]?.type).toBe('document');

    const eml = read('ago-07');
    const email = await prepareDocument(eml.bytes, 'message/rfc822', 'tomas.eml');
    expect(email.kind).toBe('email');
    expect(email.blocks.map((b) => b.type)).toEqual(['text', 'text', 'document']);
  });

  it('parses e-mails and WhatsApp exports for the receipt view', async () => {
    const email = await parseEmail(read('ago-07').bytes);
    expect(email.subject).toBe('Invoice INV-TA-0008 — agosto');
    expect(email.attachments[0]).toMatchObject({
      filename: 'INV-TA-0008.pdf',
      mediaType: 'application/pdf',
    });

    const chat = parseChat(read('ago-11').bytes.toString('utf8'));
    expect(chat.messages).toHaveLength(3);
    expect(chat.messages[1]?.sender).toBe('Rafael Mendoza');
    expect(chat.messages[1]?.text).toContain('Llave Bre-B: @rafamendoza');
  });
});

describe('record/replay cache', () => {
  it('reports unreadable documents when there is no recording and no live reader', async () => {
    const extractor = new CachedExtractor(
      new ExtractionCache(mkdtempSync(join(tmpdir(), 'mandato-'))),
      null,
    );
    const { bill, bytes } = read('ago-01');
    const outcome = await extractor.extract({
      bytes,
      mediaType: bill.mediaType,
      filename: 'x.pdf',
      sha256: sha256(bytes),
    });
    expect(outcome.extraction).toBeNull();
    expect(outcome.error).toContain('no hay una lectura grabada');
    expect(loadConfig({}).EXTRACTION_MODEL).toBe('claude-opus-5-5');
  });
});
