import { AP_EMAIL } from '../company';
import type { ChatSpec, DatasetBill, EmailSpec } from '../types';

function base64Lines(data: Buffer): string {
  return (
    data
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? ''
  );
}

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII header values
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** A minimal, standards-compliant RFC 5322 message with an optional PDF attachment. */
export function buildEml(bill: DatasetBill, email: EmailSpec, attachment: Buffer | null): string {
  const date = new Date(bill.receivedAt).toUTCString().replace('GMT', '+0000');
  const boundary = `mandato-${bill.id}`;
  const headers = [
    `From: ${encodeHeader(email.fromName)} <${email.fromAddress}>`,
    `To: Pagos Andes Labs <${AP_EMAIL}>`,
    `Subject: ${encodeHeader(email.subject)}`,
    `Date: ${date}`,
    `Message-ID: <${bill.id}@mandato.demo>`,
    'MIME-Version: 1.0',
  ];
  const textPart = [
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(email.body, 'utf8')),
  ].join('\r\n');
  if (!attachment) {
    return [...headers, textPart, ''].join('\r\n');
  }
  const name = email.attachmentName ?? `${bill.truth.invoiceNumber ?? bill.id}.pdf`;
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    textPart,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${name}"`,
    '',
    base64Lines(attachment),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** WhatsApp "export chat" text format: [d/m/yy, hh:mm:ss] Name: message */
export function buildChatExport(chat: ChatSpec): string {
  return (
    chat.messages
      .map((m) => {
        const [date, time] = m.at.split('T');
        const [y, mo, d] = (date ?? '').split('-').map(Number);
        return `[${d}/${mo}/${String(y).slice(2)}, ${time}] ${chat.sender}: ${m.text}`;
      })
      .join('\n') + '\n'
  );
}
