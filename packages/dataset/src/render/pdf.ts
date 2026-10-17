/**
 * Renders a bill's ground-truth reading as the PDF its issuer would send: a Colombian "cuenta de
 * cobro" or factura, a Mexican factura, a Brazilian fatura or a US SaaS invoice, in the issuer's
 * language and number format. Standard Helvetica (WinAnsi), so the text layer is extractable, and
 * fixed metadata, so the same bill always renders to the same bytes.
 */
import {
  activeContract,
  type Contract,
  type Country,
  type Currency,
  type ExtractedLine,
} from '@recibido/domain';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { BillSpec } from '../bills/types';
import { COMPANY, FOREIGN_CUSTOMER_RFC } from '../company';
import { CONTRACTS } from '../contracts';
import { VENDORS } from '../vendors';
import { formatMoney, formatQuantity, LANG, longDate, shortDate, type Lang } from './locale';

type Style =
  | 'cuenta-natural' // Colombian person: cuenta de cobro, signed
  | 'cuenta-empresa' // Colombian company that bills with a cuenta de cobro
  | 'factura-co'
  | 'factura-mx'
  | 'fatura-br'
  | 'invoice-us';

interface Issuer {
  style: Style;
  /** "NIT", "C.C.", "RFC", "CNPJ", "EIN" */
  idLabel: string;
  address: string[];
  accent: [number, number, number];
  /** Mexican régimen fiscal */
  regimen?: string;
  /** a line about taxes printed under the totals */
  taxNote?: string;
}

const ISSUERS: Record<string, Issuer> = {
  'daniela-ospina': {
    style: 'cuenta-natural',
    idLabel: 'C.C.',
    address: ['Calle 10 Sur # 43A-27, apto. 1102', 'Medellín, Antioquia'],
    accent: [0.18, 0.33, 0.55],
  },
  'julian-restrepo': {
    style: 'cuenta-natural',
    idLabel: 'C.C.',
    address: ['Carrera 70 # 44-36', 'Medellín, Antioquia'],
    accent: [0.2, 0.2, 0.2],
  },
  'estudio-ceiba': {
    style: 'cuenta-empresa',
    idLabel: 'NIT',
    address: ['Calle 69 # 5-38, oficina 301', 'Bogotá D.C.'],
    accent: [0.16, 0.45, 0.32],
    taxNote: 'No responsables de IVA.',
  },
  'mantenimientos-guadua': {
    style: 'factura-co',
    idLabel: 'NIT',
    address: ['Carrera 50 # 29-120, bodega 4', 'Medellín, Antioquia'],
    accent: [0.42, 0.5, 0.18],
    taxNote: 'Precios con IVA incluido.',
  },
  'cardumen-digital': {
    style: 'factura-co',
    idLabel: 'NIT',
    address: ['Avenida 6N # 23-45, piso 3', 'Cali, Valle del Cauca'],
    accent: [0.05, 0.42, 0.6],
    taxNote: 'Exportación de servicios exenta de IVA (art. 481 del Estatuto Tributario).',
  },
  'nimbo-consultores': {
    style: 'cuenta-empresa',
    idLabel: 'NIT',
    address: ['Carrera 7 # 71-21, torre B, piso 9', 'Bogotá D.C.'],
    accent: [0.35, 0.35, 0.45],
    taxNote: 'No responsables de IVA.',
  },
  'andres-villasenor': {
    style: 'factura-mx',
    idLabel: 'RFC',
    address: ['Av. Chapultepec 480, Col. Americana', 'C.P. 44160, Guadalajara, Jalisco'],
    accent: [0.55, 0.2, 0.15],
    regimen: '612 - Personas Físicas con Actividades Empresariales y Profesionales',
  },
  'renata-aguilar': {
    style: 'factura-mx',
    idLabel: 'RFC',
    address: ['Calle Orizaba 112, Col. Roma Norte', 'C.P. 06700, Cuauhtémoc, Ciudad de México'],
    accent: [0.45, 0.15, 0.45],
    regimen: '612 - Personas Físicas con Actividades Empresariales y Profesionales',
  },
  'ximena-robles': {
    style: 'factura-mx',
    idLabel: 'RFC',
    address: ['Av. Eugenio Garza Sada 2501, Col. Tecnológico', 'C.P. 64700, Monterrey, Nuevo León'],
    accent: [0.1, 0.35, 0.4],
    regimen: '612 - Personas Físicas con Actividades Empresariales y Profesionales',
  },
  'palabra-viva': {
    style: 'factura-mx',
    idLabel: 'RFC',
    address: ['Calle 5 de Mayo 1606, Centro', 'C.P. 72000, Puebla, Puebla'],
    accent: [0.7, 0.35, 0.1],
    regimen: '601 - General de Ley Personas Morales',
  },
  'thiago-moreira': {
    style: 'fatura-br',
    idLabel: 'CNPJ',
    address: ['Rua da Bahia, 1148, sala 804, Centro', 'Belo Horizonte - MG'],
    accent: [0.1, 0.3, 0.5],
  },
  'beatriz-lima': {
    style: 'fatura-br',
    idLabel: 'CNPJ',
    address: ['Rua Augusta, 2203, conj. 51, Cerqueira César', 'São Paulo - SP'],
    accent: [0.6, 0.25, 0.35],
  },
  'estudio-jabuti': {
    style: 'fatura-br',
    idLabel: 'CNPJ',
    address: ['Rua Bocaiúva, 2125, Centro', 'Florianópolis - SC'],
    accent: [0.2, 0.5, 0.25],
  },
  'trazo-cloud': {
    style: 'invoice-us',
    idLabel: 'EIN',
    address: ['548 Market St, Suite 30422', 'San Francisco, CA 94104'],
    accent: [0.36, 0.25, 0.75],
  },
  'faro-hosting': {
    style: 'invoice-us',
    idLabel: 'EIN',
    address: ['1201 Congress Ave, Suite 410', 'Austin, TX 78701'],
    accent: [0.9, 0.45, 0.1],
  },
};

const NIMBO = 'nimbo-consultores';

const TITLE: Record<Style, string> = {
  'cuenta-natural': 'CUENTA DE COBRO',
  'cuenta-empresa': 'CUENTA DE COBRO',
  'factura-co': 'FACTURA DE VENTA',
  'factura-mx': 'FACTURA',
  'fatura-br': 'FATURA DE SERVIÇOS',
  'invoice-us': 'INVOICE',
};

const L = {
  es: {
    number: 'No.',
    issued: 'Fecha de emisión',
    due: 'Fecha de vencimiento',
    billTo: 'Cliente',
    period: 'Período facturado',
    description: 'Descripción',
    qty: 'Cant.',
    unit: 'Valor unitario',
    amount: 'Valor total',
    total: 'TOTAL',
    payment: 'Datos para el pago',
    terms: (n: number) => `Condiciones de pago: ${n} días a partir de la fecha de emisión.`,
    early: (pct: string, days: number) =>
      `Descuento por pronto pago: ${pct} si se paga dentro de los ${days} días siguientes a la emisión.`,
    corrected: 'corregida',
    replaces: (n: string) => `Este documento corrige y reemplaza el No. ${n}.`,
    country: 'Estados Unidos',
  },
  pt: {
    number: 'Nº',
    issued: 'Data de emissão',
    due: 'Vencimento',
    billTo: 'Tomador',
    period: 'Período de referência',
    description: 'Descrição',
    qty: 'Qtd.',
    unit: 'Valor unitário',
    amount: 'Valor total',
    total: 'TOTAL',
    payment: 'Dados para pagamento',
    terms: (n: number) => `Condições de pagamento: ${n} dias a partir da data de emissão.`,
    early: (pct: string, days: number) => `Desconto de ${pct} para pagamento em até ${days} dias.`,
    corrected: 'corrigida',
    replaces: (n: string) => `Esta fatura corrige e substitui a fatura nº ${n}.`,
    country: 'Estados Unidos',
  },
  en: {
    number: 'Invoice #',
    issued: 'Invoice date',
    due: 'Due date',
    billTo: 'Bill to',
    period: 'Service period',
    description: 'Description',
    qty: 'Qty',
    unit: 'Unit price',
    amount: 'Amount',
    total: 'Amount due',
    payment: 'Payment details',
    terms: (n: number) => `Payment terms: Net ${n}.`,
    early: (pct: string, days: number) =>
      `Early payment discount: ${pct} if paid within ${days} days.`,
    corrected: 'corrected',
    replaces: (n: string) => `This invoice corrects and replaces invoice ${n}.`,
    country: 'United States',
  },
} satisfies Record<Lang, unknown>;

const BUYER_ADDRESS = ['1007 N Orange St, 4th Floor', 'Wilmington, DE 19801'];

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.82, 0.82, 0.85);
const WHITE = rgb(1, 1, 1);
const BOTTOM = 50;

/** WinAnsi has no arrow: print "ES -> PT/EN" instead of "ES → PT/EN". */
const winAnsi = (s: string) => s.replace(/→/g, '->');

interface Pen {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
}

function text(
  pen: Pen,
  s: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' } = {},
) {
  // one page only: content that would run into the bottom margin is a layout bug, not a page 2
  if (y < BOTTOM) throw new Error(`"${s}" would be drawn below the bottom margin`);
  const size = opts.size ?? 9.5;
  const font = opts.bold ? pen.bold : pen.regular;
  const str = winAnsi(s);
  const dx = opts.align === 'right' ? font.widthOfTextAtSize(str, size) : 0;
  pen.page.drawText(str, { x: x - dx, y, size, font, color: opts.color ?? INK });
}

function wrap(font: PDFFont, s: string, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of winAnsi(s).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function issuerOf(spec: BillSpec) {
  const key = spec.vendorId ?? NIMBO;
  const issuer = ISSUERS[key];
  if (!issuer) throw new Error(`${spec.id}: no document style for ${key}`);
  const vendor = VENDORS.find((v) => v.id === spec.vendorId) ?? null;
  const country: Country = vendor?.country ?? 'CO';
  const contract: Contract | null =
    vendor && spec.truth.issueDate ? activeContract(vendor, CONTRACTS, spec.truth.issueDate) : null;
  return {
    issuer,
    vendor,
    country,
    contract,
    email: vendor?.email ?? 'facturacion@nimboconsultores.co',
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

/** A US entity: its EIN, or the generic foreign RFC on a Mexican CFDI. */
function buyerId(style: Style): string {
  return style === 'factura-mx'
    ? `RFC ${FOREIGN_CUSTOMER_RFC} (residente en el extranjero)`
    : `EIN ${COMPANY.taxId}`;
}

function percent(bps: number, lang: Lang): string {
  const s = (bps / 100).toString();
  return `${lang === 'en' ? s : s.replace('.', ',')}%`;
}

function notes(spec: BillSpec, issuer: Issuer, lang: Lang, contract: Contract | null): string[] {
  const l = L[lang];
  const out: string[] = [];
  if (spec.truth.revisionOf) out.push(l.replaces(spec.truth.revisionOf));
  if (contract) {
    out.push(l.terms(contract.netDays));
    if (contract.earlyPayment)
      out.push(
        l.early(percent(contract.earlyPayment.discountBps, lang), contract.earlyPayment.withinDays),
      );
  }
  switch (issuer.style) {
    case 'cuenta-natural':
      out.push(
        'Declaro que no soy responsable de IVA.',
        'Declaro que no he contratado ni vinculado trabajadores para la prestación de este servicio.',
      );
      break;
    case 'factura-mx':
      out.push(
        `Régimen fiscal del emisor: ${issuer.regimen}.`,
        'Uso del CFDI: S01 - Sin efectos fiscales. Forma de pago: 03 - Transferencia electrónica de fondos. Método de pago: PUE - Pago en una sola exhibición.',
        'Exportación de servicios: 02 - Definitiva, IVA tasa 0%.',
      );
      break;
    case 'fatura-br':
      out.push(
        'Exportação de serviços para tomador no exterior: não incide ISS (LC 116/2003, art. 2º, I).',
      );
      break;
    case 'invoice-us':
      out.push('Thank you for your business.');
      break;
    default:
      if (issuer.taxNote) out.push(issuer.taxNote);
  }
  return out;
}

const PAGE: Record<Country, [number, number]> = {
  CO: [612, 792], // carta
  MX: [612, 792],
  US: [612, 792],
  BR: [595.28, 841.89], // A4
};

export async function renderBillPdf(spec: BillSpec): Promise<Uint8Array> {
  const t = spec.truth;
  const currency = t.currency as Currency;
  const { issuer, country, contract, email } = issuerOf(spec);
  const lang = LANG[country];
  const l = L[lang];
  const name = t.vendorName ?? '';
  const title = TITLE[issuer.style];
  const when = new Date(`${t.issueDate}T09:00:00-05:00`);

  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(`${TITLE[issuer.style]} ${t.invoiceNumber}`);
  doc.setAuthor(name);
  doc.setCreator(name);
  doc.setProducer('pdf-lib');
  doc.setCreationDate(when);
  doc.setModificationDate(when);
  doc.setLanguage({ es: 'es-CO', pt: 'pt-BR', en: 'en-US' }[lang]);
  const [width, height] = PAGE[country];
  const pen: Pen = {
    page: doc.addPage([width, height]),
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const accent = rgb(...issuer.accent);
  const left = 50;
  const right = width - 50;

  // header: mark, issuer, document title
  pen.page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent });
  let y = height - 60;
  pen.page.drawRectangle({ x: left, y: y - 8, width: 40, height: 40, color: accent });
  text(pen, initials(name), left + 20 - pen.bold.widthOfTextAtSize(initials(name), 15) / 2, y + 5, {
    size: 15,
    bold: true,
    color: WHITE,
  });
  const ix = left + 52;
  const nameRoom = right - pen.bold.widthOfTextAtSize(title, 15) - 16 - ix;
  const nameSize = Math.min(12.5, (12.5 * nameRoom) / pen.bold.widthOfTextAtSize(name, 12.5));
  text(pen, name, ix, y + 20, { size: nameSize, bold: true });
  text(pen, `${issuer.idLabel} ${t.vendorTaxId}`, ix, y + 6, { color: MUTED });
  issuer.address.forEach((a, i) => text(pen, a, ix, y - 7 - i * 12, { color: MUTED, size: 8.5 }));
  text(pen, email, ix, y - 31, { color: MUTED, size: 8.5 });

  text(pen, title, right, y + 20, { size: 15, bold: true, color: accent, align: 'right' });
  text(pen, `${l.number} ${t.invoiceNumber}`, right, y + 4, {
    size: 11,
    bold: true,
    align: 'right',
  });
  text(pen, `${l.issued}: ${shortDate(t.issueDate!, country)}`, right, y - 10, { align: 'right' });
  if (t.dueDate)
    text(pen, `${l.due}: ${shortDate(t.dueDate, country)}`, right, y - 23, { align: 'right' });
  if (t.revisionOf)
    text(pen, l.corrected.toUpperCase(), right, y - 38, {
      bold: true,
      color: accent,
      align: 'right',
    });

  // bill-to
  y -= 70;
  pen.page.drawLine({ start: { x: left, y: y + 14 }, end: { x: right, y: y + 14 }, color: RULE });
  if (issuer.style === 'cuenta-natural' || issuer.style === 'cuenta-empresa') {
    const city = issuer.address.at(-1)!.split(',')[0];
    text(pen, `${city}, ${longDate(t.issueDate!, lang)}`, left, y);
    y -= 22;
  }
  text(pen, l.billTo.toUpperCase(), left, y, { size: 8, bold: true, color: MUTED });
  y -= 14;
  text(pen, COMPANY.legalName, left, y, { bold: true, size: 10.5 });
  y -= 13;
  for (const line of [buyerId(issuer.style), ...BUYER_ADDRESS, l.country]) {
    text(pen, line, left, y, { color: MUTED });
    y -= 12;
  }
  if (issuer.style === 'cuenta-natural') {
    y -= 8;
    text(pen, 'DEBE A:', left, y, { bold: true });
    text(pen, `${name}, ${issuer.idLabel} ${t.vendorTaxId}`, left + 48, y);
    y -= 13;
    text(
      pen,
      `La suma de ${formatMoney(t.total!, currency)} por los conceptos que se detallan:`,
      left,
      y,
    );
    y -= 12;
  }
  if (t.periodFrom && t.periodTo) {
    y -= 8;
    text(pen, `${l.period}: `, left, y, { bold: true });
    text(
      pen,
      `${longDate(t.periodFrom, lang)} – ${longDate(t.periodTo, lang)}`,
      left + pen.bold.widthOfTextAtSize(`${l.period}: `, 9.5),
      y,
    );
    y -= 12;
  }

  // lines
  y -= 16;
  const cols = { qty: right - 200, unit: right - 100, amount: right - 6 };
  const descWidth = cols.qty - left - 60;
  pen.page.drawRectangle({
    x: left,
    y: y - 6,
    width: right - left,
    height: 20,
    color: accent,
    opacity: 0.12,
  });
  text(pen, l.description, left + 6, y, { bold: true, size: 8.5 });
  text(pen, l.qty, cols.qty, y, { bold: true, size: 8.5, align: 'right' });
  text(pen, l.unit, cols.unit, y, { bold: true, size: 8.5, align: 'right' });
  text(pen, l.amount, cols.amount, y, { bold: true, size: 8.5, align: 'right' });
  y -= 22;
  t.lines.forEach((line: ExtractedLine) => {
    const rows = wrap(pen.regular, line.description, 9.5, descWidth);
    rows.forEach((r, i) => text(pen, r, left + 6, y - i * 12));
    if (line.quantity)
      text(pen, formatQuantity(line.quantity, currency), cols.qty, y, { align: 'right' });
    if (line.unitPrice)
      text(pen, formatMoney(line.unitPrice, currency), cols.unit, y, { align: 'right' });
    if (line.amount)
      text(pen, formatMoney(line.amount, currency), cols.amount, y, { align: 'right' });
    const rule = y - (rows.length - 1) * 12 - 7;
    pen.page.drawLine({ start: { x: left, y: rule }, end: { x: right, y: rule }, color: RULE });
    y = rule - 15;
  });

  // total
  y -= 14;
  text(pen, l.total, cols.unit, y, { bold: true, size: 11, align: 'right' });
  text(pen, formatMoney(t.total!, currency), cols.amount, y, {
    bold: true,
    size: 11,
    align: 'right',
  });
  y -= 13;
  text(pen, currency, cols.amount, y, { color: MUTED, size: 8.5, align: 'right' });

  // notes, payment, signature
  y -= 26;
  for (const note of notes(spec, issuer, lang, contract)) {
    for (const r of wrap(pen.regular, note, 8.5, right - left)) {
      text(pen, r, left, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
    y -= 2;
  }
  if (t.payoutDetails) {
    y -= 14;
    text(pen, l.payment.toUpperCase(), left, y, { size: 8, bold: true, color: MUTED });
    y -= 13;
    text(pen, t.payoutDetails, left, y);
    y -= 12;
  }
  if (issuer.style === 'cuenta-natural' || issuer.style === 'cuenta-empresa') {
    y -= 50;
    pen.page.drawLine({
      start: { x: left, y: y + 12 },
      end: { x: left + 200, y: y + 12 },
      color: INK,
    });
    text(pen, name, left, y, { bold: true });
    text(pen, `${issuer.idLabel} ${t.vendorTaxId}`, left, y - 12, { color: MUTED });
  }

  return doc.save({ useObjectStreams: false });
}
