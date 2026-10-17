import type { BillSpec } from '../bills/types';
import { COMPANY } from '../company';

interface Envelope {
  from: string;
  to: string;
  subject: string;
}

const AP = `Cuentas por pagar Altamar <${COMPANY.billingEmail}>`;

/** Who sent each e-mail bill and how they titled it. */
const ENVELOPES: Record<string, Envelope> = {
  // a look-alike domain: the real Faro bills from billing@farohosting.io
  'sep-05': {
    from: 'Faro Hosting Billing <billing@farohosting-payments.io>',
    to: AP,
    subject: 'Invoice FH-10482 - updated remittance details',
  },
  'sep-11': {
    from: 'Daniela Ospina <daniela@ospinagaviria.dev>',
    to: 'Paula Herrera <paula@altamarlabs.com>',
    subject: 'Reenvío: cuenta de cobro DO-2026-08 (agosto)',
  },
  'sep-17': {
    from: 'Andrés Villaseñor <andres@villasenor.mx>',
    to: AP,
    subject: 'Factura AV-2026-05 - Hito M2',
  },
  'oct-06': {
    from: 'Thiago Moreira <thiago@moreiradados.com.br>',
    to: 'Paula Herrera <paula@altamarlabs.com>',
    subject: 'Fatura TM-2026-09 - setembro',
  },
  'oct-07': {
    from: 'Lina Cárdenas <lina@altamarlabs.com>',
    to: 'Paula Herrera <paula@altamarlabs.com>',
    subject: 'RV: Cuenta de cobro JR-2026-09',
  },
  'oct-13': {
    from: 'Nimbo Consultores <facturacion@nimboconsultores.co>',
    to: AP,
    subject: 'Cuenta de cobro NC-0098 - Auditoría de seguridad',
  },
  'oct-17': {
    from: 'Ximena Robles <ximena@robles.dev>',
    to: 'Paula Herrera <paula@altamarlabs.com>',
    subject: 'Factura XR-0011 - Reportes fiscales (ALT-238)',
  },
};

/** RFC 2047 encoded-word for a header value that is not plain ASCII. */
const header = (value: string) =>
  /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/** "Ana <a@b.co>" with the display name encoded when needed. */
const address = (value: string) => {
  const m = /^(.*) <(.+)>$/.exec(value);
  return m ? `${header(m[1]!)} <${m[2]}>` : value;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-02T09:10:00-05:00" → "Fri, 02 Oct 2026 09:10:00 -0500" (Bogotá local time). */
export function rfc5322Date(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}):(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not a local ISO datetime: ${iso}`);
  const [, y, mo, d, time, oh, om] = m;
  const weekday = new Date(Date.UTC(+y!, +mo! - 1, +d!)).getUTCDay();
  return `${DAYS[weekday]}, ${d} ${MONTHS[+mo! - 1]} ${y} ${time} ${oh}${om}`;
}

const base64Lines = (data: Uint8Array) =>
  Buffer.from(data)
    .toString('base64')
    .match(/.{1,76}/g)!
    .join('\r\n');

/**
 * An RFC 5322 message: the plain-text UTF-8 body and the bill's PDF attached, as the vendor
 * (or a colleague forwarding it) sent it.
 */
export function buildEml(spec: BillSpec, receivedAt: string, attachment: Uint8Array): string {
  const env = ENVELOPES[spec.id];
  if (!env || !spec.body)
    throw new Error(`${spec.id}: an e-mail bill needs an envelope and a body`);
  const domain = /@([^>]+)>/.exec(env.from)![1];
  const boundary = `=_recibido_${spec.id}`;
  const filename = `${spec.truth.invoiceNumber ?? spec.id}.pdf`;
  const body = spec.body.replace(/\r?\n/g, '\r\n');
  return [
    `From: ${address(env.from)}`,
    `To: ${address(env.to)}`,
    `Subject: ${header(env.subject)}`,
    `Date: ${rfc5322Date(receivedAt)}`,
    `Message-ID: <${spec.id}.${spec.truth.invoiceNumber ?? 'bill'}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    base64Lines(attachment),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
