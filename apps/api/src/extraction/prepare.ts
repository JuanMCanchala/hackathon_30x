/**
 * Turns an uploaded document into (a) content blocks for the reader and (b) every piece of text
 * we can read deterministically, which feeds the instruction scanner (ADR-0010).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { simpleParser } from 'mailparser';
import { extractText, getDocumentProxy } from 'unpdf';

export type DocumentKind = 'pdf' | 'image' | 'email' | 'text';

export type ReaderBlock =
  | Anthropic.Beta.BetaTextBlockParam
  | Anthropic.Beta.BetaImageBlockParam
  | Anthropic.Beta.BetaRequestDocumentBlock;

export interface PreparedDocument {
  kind: DocumentKind;
  blocks: ReaderBlock[];
  /** Text we could read ourselves (PDF text layer incl. hidden text, e-mail bodies, chats). */
  texts: string[];
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export const ALLOWED_MEDIA_TYPES = new Set([
  'application/pdf',
  'message/rfc822',
  'text/plain',
  ...IMAGE_TYPES,
]);

export function documentKind(mediaType: string, filename: string): DocumentKind | null {
  const lower = filename.toLowerCase();
  if (mediaType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (IMAGE_TYPES.has(mediaType) || /\.(png|jpe?g|webp|gif)$/.test(lower)) return 'image';
  if (mediaType === 'message/rfc822' || lower.endsWith('.eml')) return 'email';
  if (mediaType.startsWith('text/') || lower.endsWith('.txt')) return 'text';
  return null;
}

export function mediaTypeFor(filename: string, fallback = 'application/octet-stream'): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.eml')) return 'message/rfc822';
  if (lower.endsWith('.txt')) return 'text/plain';
  return fallback;
}

export async function pdfText(bytes: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return '';
  }
}

function pdfBlock(bytes: Buffer): Anthropic.Beta.BetaRequestDocumentBlock {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
  };
}

function imageBlock(bytes: Buffer, mediaType: string): Anthropic.Beta.BetaImageBlockParam {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
      data: bytes.toString('base64'),
    },
  };
}

export async function prepareDocument(
  bytes: Buffer,
  mediaType: string,
  filename: string,
): Promise<PreparedDocument> {
  const kind = documentKind(mediaType, filename);
  switch (kind) {
    case 'pdf':
      return { kind, blocks: [pdfBlock(bytes)], texts: [await pdfText(bytes)] };
    case 'image':
      return { kind, blocks: [imageBlock(bytes, mediaType)], texts: [] };
    case 'text': {
      const text = bytes.toString('utf8');
      return {
        kind,
        blocks: [{ type: 'text', text: `Mensaje recibido (${filename}):\n\n${text}` }],
        texts: [text],
      };
    }
    case 'email': {
      const mail = await simpleParser(bytes);
      const from = mail.from?.text ?? '';
      const header = [
        `De: ${from}`,
        `Asunto: ${mail.subject ?? ''}`,
        `Fecha: ${mail.date?.toISOString() ?? ''}`,
      ].join('\n');
      const body = mail.text ?? '';
      const blocks: ReaderBlock[] = [
        { type: 'text', text: `Correo recibido.\n${header}\n\n${body}` },
      ];
      const texts = [body, mail.subject ?? ''];
      for (const attachment of mail.attachments) {
        const type = attachment.contentType;
        if (type === 'application/pdf') {
          blocks.push({ type: 'text', text: `Adjunto: ${attachment.filename ?? 'documento.pdf'}` });
          blocks.push(pdfBlock(attachment.content));
          texts.push(await pdfText(attachment.content));
        } else if (IMAGE_TYPES.has(type)) {
          blocks.push({ type: 'text', text: `Adjunto: ${attachment.filename ?? 'imagen'}` });
          blocks.push(imageBlock(attachment.content, type));
        } else if (type.startsWith('text/')) {
          const text = attachment.content.toString('utf8');
          blocks.push({ type: 'text', text: `Adjunto ${attachment.filename ?? ''}:\n${text}` });
          texts.push(text);
        }
      }
      return { kind, blocks, texts };
    }
    default:
      throw new Error(`Tipo de documento no soportado: ${mediaType}`);
  }
}

export interface ParsedEmail {
  kind: 'email';
  from: string;
  to: string;
  subject: string;
  date: string | null;
  text: string;
  attachments: { index: number; filename: string; mediaType: string; size: number }[];
}

export interface ParsedChat {
  kind: 'chat';
  messages: { at: string | null; sender: string | null; text: string }[];
}

/** Human-friendly view of an e-mail for the receipt screen. */
export async function parseEmail(bytes: Buffer): Promise<ParsedEmail & { raw: Buffer[] }> {
  const mail = await simpleParser(bytes);
  const toField = Array.isArray(mail.to)
    ? mail.to.map((t) => t.text).join(', ')
    : (mail.to?.text ?? '');
  return {
    kind: 'email',
    from: mail.from?.text ?? '',
    to: toField,
    subject: mail.subject ?? '',
    date: mail.date?.toISOString() ?? null,
    text: mail.text ?? '',
    attachments: mail.attachments.map((a, index) => ({
      index,
      filename: a.filename ?? `adjunto-${index + 1}`,
      mediaType: a.contentType,
      size: a.size,
    })),
    raw: mail.attachments.map((a) => a.content),
  };
}

const WHATSAPP_LINE =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s?(.*)$/;

/** Parses a WhatsApp "export chat" text; falls back to a single message. */
export function parseChat(text: string): ParsedChat {
  const messages: ParsedChat['messages'] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = WHATSAPP_LINE.exec(line);
    if (match) {
      const [, d, m, y, time, sender, body] = match;
      const year = (y ?? '').length === 2 ? `20${y}` : y;
      messages.push({
        at: `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${time}`,
        sender: sender?.trim() ?? null,
        text: body ?? '',
      });
    } else if (messages.length > 0) {
      messages[messages.length - 1]!.text += `\n${line}`;
    } else if (line.trim()) {
      messages.push({ at: null, sender: null, text: line });
    }
  }
  return { kind: 'chat', messages: messages.map((m) => ({ ...m, text: m.text.trimEnd() })) };
}

/** Only the deterministic texts of a document (no reader call): feeds the instruction scanner. */
export async function readableTexts(
  bytes: Buffer,
  mediaType: string,
  filename: string,
): Promise<string[]> {
  const kind = documentKind(mediaType, filename);
  if (kind === 'pdf') return [await pdfText(bytes)];
  if (kind === 'text') return [bytes.toString('utf8')];
  if (kind === 'email') {
    const mail = await simpleParser(bytes);
    const texts = [mail.text ?? '', mail.subject ?? ''];
    for (const attachment of mail.attachments) {
      if (attachment.contentType === 'application/pdf')
        texts.push(await pdfText(attachment.content));
      else if (attachment.contentType.startsWith('text/'))
        texts.push(attachment.content.toString('utf8'));
    }
    return texts;
  }
  return [];
}
