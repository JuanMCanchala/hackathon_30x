/**
 * The text we can read ourselves from a received document: the PDF text layer, an e-mail body
 * followed by the text of its attached PDFs, or a chat transcript. It is the same text the
 * dataset tests build (packages/dataset/test/documents.ts), so the scanners see what the reader
 * sees.
 */
import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import { extractText, getDocumentProxy } from 'unpdf';

export type DocumentChannel = 'pdf' | 'email' | 'chat';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** '' for a PDF without a readable text layer (the reader then reports low confidence). */
async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return '';
  }
}

export async function documentText(
  bytes: Uint8Array,
  filename: string,
): Promise<{ channel: DocumentChannel; text: string }> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return { channel: 'pdf', text: await pdfText(bytes) };
  if (lower.endsWith('.txt')) return { channel: 'chat', text: Buffer.from(bytes).toString('utf8') };
  if (lower.endsWith('.eml')) {
    const mail = await simpleParser(Buffer.from(bytes));
    const parts = [(mail.text ?? '').replace(/\r\n/g, '\n').trim()];
    for (const attachment of mail.attachments) {
      if (attachment.contentType === 'application/pdf')
        parts.push(await pdfText(attachment.content));
    }
    return { channel: 'email', text: parts.join('\n\n') };
  }
  throw new Error(`Tipo de documento no soportado: ${filename}`);
}
