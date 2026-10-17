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

/** The PDF text layer; null when the file cannot be parsed as a PDF. */
async function pdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return null;
  }
}

export async function documentText(
  bytes: Uint8Array,
  filename: string,
): Promise<{ channel: DocumentChannel; text: string }> {
  const lower = filename.toLowerCase();
  // An unparseable PDF has no text; the reader reports it unreadable without asking the model.
  if (lower.endsWith('.pdf')) return { channel: 'pdf', text: (await pdfText(bytes)) ?? '' };
  if (lower.endsWith('.txt')) return { channel: 'chat', text: Buffer.from(bytes).toString('utf8') };
  if (lower.endsWith('.eml')) {
    const mail = await simpleParser(Buffer.from(bytes));
    const parts = [(mail.text ?? '').replace(/\r\n/g, '\n').trim()];
    for (const attachment of mail.attachments) {
      if (attachment.contentType !== 'application/pdf') continue;
      // A marker, so the reader knows part of the bill is missing and lowers its confidence.
      const text = await pdfText(attachment.content);
      parts.push(text ?? `[adjunto ilegible: ${attachment.filename ?? 'documento.pdf'}]`);
    }
    return { channel: 'email', text: parts.join('\n\n') };
  }
  throw new Error(`Tipo de documento no soportado: ${filename}`);
}
