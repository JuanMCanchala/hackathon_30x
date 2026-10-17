/** The text a reader can take from each rendered document, the way the API will. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { filesDir, type BillSpec } from '../src';

export async function pdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** The plain-text body and the attached PDF of an .eml written by the generator. */
function emlParts(eml: string): { body: string; attachment: Uint8Array } {
  const boundary = /boundary="([^"]+)"/.exec(eml)![1]!;
  const [, textPart, pdfPart] = eml.split(`--${boundary}`);
  const content = (part: string) => part.slice(part.indexOf('\r\n\r\n') + 4);
  return {
    body: content(textPart!).replace(/\r\n/g, '\n').trim(),
    attachment: Buffer.from(content(pdfPart!).replace(/\s+/g, ''), 'base64'),
  };
}

/** PDF text layer · e-mail body + attached PDF text · chat transcript */
export async function documentText(spec: BillSpec): Promise<string> {
  const data = readFileSync(join(filesDir(), spec.file));
  if (spec.file.endsWith('.pdf')) return pdfText(data);
  if (spec.file.endsWith('.txt')) return data.toString('utf8');
  const { body, attachment } = emlParts(data.toString('utf8'));
  return `${body}\n\n${await pdfText(attachment)}`;
}
