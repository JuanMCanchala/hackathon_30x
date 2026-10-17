/**
 * HTML for every kind of bill in the dataset. The ground-truth extraction is the single source
 * of truth: the documents are rendered from it, so what a perfect reader extracts is exactly
 * what is printed.
 */
import type { ExtractedInvoice } from '@mandato/domain';
import { AP_EMAIL, ORGANIZATION, ORGANIZATION_ADDRESS } from '../company';
import type { DatasetBill } from '../types';
import {
  dateEn,
  dateLongEs,
  dateNumeric,
  escapeHtml as e,
  fakeHex,
  fakeUuid,
  moneyBR,
  moneyCO,
  moneyMX,
  moneyPE,
  moneyUS,
} from './locale';

const FICTITIOUS = 'Documento ficticio generado para la demo de Mandato · Fictitious document';

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', 'Noto Sans', 'DejaVu Sans', sans-serif; color: #1d2433; }
  .page { width: 816px; min-height: 1056px; padding: 56px 64px; background: #fff; position: relative; }
  .muted { color: #6b7280; }
  .small { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 6px; font-size: 12.5px; vertical-align: top; }
  th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; border-bottom: 1.5px solid #1d2433; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tbody td { border-bottom: 1px solid #e5e7eb; }
  .totals td { border: none; padding: 4px 6px; }
  .totals .grand td { font-weight: 700; font-size: 15px; border-top: 1.5px solid #1d2433; padding-top: 8px; }
  .footer { position: absolute; left: 64px; right: 64px; bottom: 32px; font-size: 9.5px; color: #9ca3af; text-align: center; }
  .note { margin-top: 18px; padding: 10px 12px; border-left: 3px solid #f59e0b; background: #fffbeb; font-size: 12px; }
  .hidden { color: #ffffff; font-size: 1px; line-height: 1px; }
`;

function shell(title: string, css: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${e(title)}</title>
<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

function itemsTable(
  x: ExtractedInvoice,
  money: (v: string) => string,
  labels: { description: string; qty: string; unit: string; amount: string },
) {
  const rows = x.lineItems
    .map(
      (i) => `<tr><td>${e(i.description)}</td><td class="num">${e(i.quantity ?? '1')}</td>
      <td class="num">${i.unitPrice && /^\d+(\.\d{1,2})?$/.test(i.unitPrice) ? money(i.unitPrice) : e(i.unitPrice ?? '')}</td>
      <td class="num">${money(i.amount)}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>${labels.description}</th><th class="num">${labels.qty}</th>
    <th class="num">${labels.unit}</th><th class="num">${labels.amount}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function totals(
  x: ExtractedInvoice,
  money: (v: string) => string,
  labels: { subtotal: string; total: string },
) {
  const taxes = x.taxes
    .map(
      (t) =>
        `<tr><td></td><td class="num">${e(t.name)}</td><td class="num" style="width:150px">${money(t.amount)}</td></tr>`,
    )
    .join('');
  return `<table class="totals" style="margin-top:10px">
    ${x.subtotal ? `<tr><td></td><td class="num">${labels.subtotal}</td><td class="num" style="width:150px">${money(x.subtotal)}</td></tr>` : ''}
    ${taxes}
    <tr class="grand"><td></td><td class="num">${labels.total}</td><td class="num">${money(x.total ?? '0')}</td></tr>
  </table>`;
}

function extrasHtml(bill: DatasetBill) {
  const ex = bill.document.extras ?? {};
  const notes = (ex.notes ?? []).map((n) => `<div class="note">${e(n)}</div>`).join('');
  const injected = ex.injectedNote
    ? `<div style="margin-top:22px;padding:12px 14px;border:1.5px dashed #9ca3af;font-size:12px;font-weight:600;letter-spacing:.02em">${e(ex.injectedNote)}</div>`
    : '';
  const hidden = ex.hiddenText ? `<div class="hidden">${e(ex.hiddenText)}</div>` : '';
  return notes + injected + hidden;
}

// ---------------------------------------------------------------------------- Colombia

function cuentaDeCobro(bill: DatasetBill) {
  const x = bill.truth;
  const ex = bill.document.extras ?? {};
  const words = x.amountInWords ? x.amountInWords.toUpperCase() : '';
  const css = `
    .page { font-family: 'Noto Serif', 'DejaVu Serif', serif; font-size: 14px; line-height: 1.6; padding: 72px 84px; }
    h1 { font-size: 20px; letter-spacing: .12em; text-align: center; margin: 0 0 6px; }
    .sub { text-align: center; margin-bottom: 36px; }
    .block { margin: 22px 0; }
    .label { font-weight: 700; letter-spacing: .08em; }
    .sum { font-size: 15px; }
    .sign { margin-top: 64px; }
    .sign .line { width: 260px; border-top: 1px solid #1d2433; margin-top: 6px; }
    .signature { font-family: 'Noto Serif', serif; font-style: italic; font-size: 26px; color: #1f3a8a; transform: rotate(-4deg); display: inline-block; margin-left: 12px; }
  `;
  const body = `<div class="page">
    <h1>CUENTA DE COBRO No. ${e(x.invoiceNumber ?? '')}</h1>
    <div class="sub muted">Bogotá D.C., ${dateLongEs(x.issueDate ?? '')}</div>
    <div class="block"><div class="label">${e(ORGANIZATION.legalName.toUpperCase())}</div>
      EIN ${e(ORGANIZATION.taxId)}<br>${e(ORGANIZATION_ADDRESS)}</div>
    <div class="block"><span class="label">DEBE A:</span><br>
      ${e((x.issuer.name ?? '').toUpperCase())}<br>${e(x.issuer.taxId ?? '')}</div>
    <div class="block sum"><span class="label">LA SUMA DE:</span> ${e(words)} (${moneyCO(x.total ?? '0')})</div>
    <div class="block"><span class="label">POR CONCEPTO DE:</span> ${e(x.lineItems[0]?.description ?? x.description ?? '')}.</div>
    <div class="block small">Declaro bajo la gravedad de juramento que no estoy obligado(a) a facturar ni soy responsable del impuesto sobre las ventas (IVA), y que no he contratado ni vinculado a dos o más trabajadores asociados a esta actividad.</div>
    <div class="block">Favor consignar a la <b>llave Bre-B ${e(x.payout.destination ?? '')}</b>.</div>
    ${extrasHtml(bill)}
    <div class="sign">Atentamente,<br><span class="signature">${e(ex.signature ?? x.issuer.name ?? '')}</span>
      <div class="line"></div>${e((x.issuer.name ?? '').toUpperCase())}<br>${e(x.issuer.taxId ?? '')}${x.issuer.email ? `<br>${e(x.issuer.email)}` : ''}</div>
    <div class="footer">${FICTITIOUS}</div></div>`;
  return shell(`Cuenta de cobro ${x.invoiceNumber}`, css, body);
}

function facturaColombia(bill: DatasetBill) {
  const x = bill.truth;
  const ex = bill.document.extras ?? {};
  const billTo = ex.billToOverride ?? {
    name: ORGANIZATION.legalName.toUpperCase(),
    taxId: `EIN ${ORGANIZATION.taxId}`,
    address: ORGANIZATION_ADDRESS,
  };
  const css = `
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 18px; }
    .brand { font-size: 22px; font-weight: 800; color: #0f766e; }
    .doc { text-align: right; }
    .doc .kind { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #0f766e; font-weight: 700; }
    .doc .num { font-size: 20px; font-weight: 800; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 22px 0; font-size: 12.5px; }
    .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .box h4 { margin: 0 0 6px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
    .words { margin-top: 14px; font-size: 12px; }
    .pay { margin-top: 14px; font-size: 12.5px; }
    .cufe { margin-top: 26px; font-size: 9.5px; color: #6b7280; word-break: break-all; }
  `;
  const body = `<div class="page">
    <div class="head"><div><div class="brand">${e(x.issuer.name ?? '')}</div>
      <div class="small muted">${e(x.issuer.taxId ?? '')} · Responsable de IVA<br>${e(ex.issuerAddress ?? 'Carrera Ejemplo 12 # 34-56, Bogotá D.C., Colombia')}<br>${e(x.issuer.email ?? '')}</div></div>
      <div class="doc"><div class="kind">Factura electrónica de venta</div><div class="num">No. ${e(x.invoiceNumber ?? '')}</div>
      <div class="small muted">Resolución DIAN 18760000000001 (ficticia)</div></div></div>
    <div class="grid">
      <div class="box"><h4>Cliente</h4><b>${e(billTo.name)}</b><br>${e(billTo.taxId)}<br>${e(billTo.address)}</div>
      <div class="box"><h4>Fechas</h4>Emisión: ${dateNumeric(x.issueDate ?? '')}<br>Vencimiento: ${x.dueDate ? dateNumeric(x.dueDate) : '—'}<br>Forma de pago: Crédito</div>
    </div>
    ${itemsTable(x, moneyCO, { description: 'Descripción', qty: 'Cant.', unit: 'Valor unitario', amount: 'Valor' })}
    ${totals(x, moneyCO, { subtotal: 'Subtotal', total: 'Total a pagar' })}
    ${x.amountInWords ? `<div class="words"><b>Valor en letras:</b> ${e(x.amountInWords.toUpperCase())}</div>` : ''}
    <div class="pay"><b>Medio de pago:</b> transferencia Bre-B a la llave <b>${e(x.payout.destination ?? '')}</b></div>
    ${extrasHtml(bill)}
    <div class="cufe">CUFE: ${fakeHex(bill.id, 96)}</div>
    <div class="footer">Representación gráfica de factura electrónica · ${FICTITIOUS}</div></div>`;
  return shell(`Factura ${x.invoiceNumber}`, css, body);
}

// ---------------------------------------------------------------------------- México

function facturaMexico(bill: DatasetBill) {
  const x = bill.truth;
  const css = `
    .page { font-size: 12px; }
    .top { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
    .title { font-size: 26px; font-weight: 800; color: #7c2d12; letter-spacing: .04em; }
    .meta { border: 1.5px solid #7c2d12; border-radius: 6px; padding: 10px 12px; font-size: 11.5px; line-height: 1.6; }
    .meta b { color: #7c2d12; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0; }
    .party { background: #fff7ed; border-radius: 6px; padding: 10px 12px; line-height: 1.55; }
    .party h4 { margin: 0 0 4px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #9a3412; }
    th { border-bottom-color: #7c2d12; }
    .pay { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11.5px; line-height: 1.6; }
    .seal { margin-top: 22px; font-size: 9px; color: #6b7280; word-break: break-all; }
  `;
  const body = `<div class="page">
    <div class="top"><div><div class="title">FACTURA</div>
      <div class="small muted">Comprobante Fiscal Digital por Internet (CFDI 4.0) · Tipo: Ingreso</div></div>
      <div class="meta"><b>Folio:</b> ${e(x.invoiceNumber ?? '')}<br><b>Fecha de emisión:</b> ${dateNumeric(x.issueDate ?? '')}<br>
      <b>Fecha límite de pago:</b> ${x.dueDate ? dateNumeric(x.dueDate) : '—'}<br><b>Lugar de expedición:</b> 64000, Monterrey, N.L.<br>
      <b>Folio fiscal:</b> ${fakeUuid(bill.id)}</div></div>
    <div class="parties">
      <div class="party"><h4>Emisor</h4><b>${e((x.issuer.name ?? '').toUpperCase())}</b><br>${e(x.issuer.taxId ?? '')}<br>Régimen fiscal: 612 · Actividades empresariales y profesionales</div>
      <div class="party"><h4>Receptor</h4><b>${e(x.billTo.name ?? '')}</b><br>RFC: ${e(x.billTo.taxId ?? '')} · Residencia fiscal: USA<br>Tax ID: ${e(ORGANIZATION.taxId)} · Uso CFDI: S01 Sin efectos fiscales</div>
    </div>
    ${itemsTable(x, moneyMX, { description: 'Concepto', qty: 'Cantidad', unit: 'Valor unitario', amount: 'Importe' })}
    ${totals(x, moneyMX, { subtotal: 'Subtotal', total: 'Total MXN' })}
    <div class="pay"><div><b>Moneda:</b> MXN — Peso mexicano<br><b>Forma de pago:</b> 03 Transferencia electrónica de fondos<br><b>Método de pago:</b> PUE Pago en una sola exhibición</div>
      <div><b>Datos para depósito (SPEI)</b><br>${e(x.payout.bankName ?? '')}<br>CLABE: ${e((x.payout.destination ?? '').replace(/(\d{3})(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4 $5'))}</div></div>
    ${extrasHtml(bill)}
    <div class="seal">Sello digital del CFDI: ${fakeHex(`${bill.id}-sello`, 180)}</div>
    <div class="footer">Este documento es una representación impresa de un CFDI · ${FICTITIOUS}</div></div>`;
  return shell(`Factura ${x.invoiceNumber}`, css, body);
}

// ---------------------------------------------------------------------------- Brasil

function faturaBrasil(bill: DatasetBill) {
  const x = bill.truth;
  const currency = x.currency ?? 'BRL';
  const money = (v: string) => moneyBR(v, currency);
  const css = `
    .page { font-size: 13px; }
    .band { background: #14532d; color: #fff; margin: -56px -64px 28px; padding: 30px 64px; display: flex; justify-content: space-between; align-items: flex-end; }
    .band .t { font-size: 28px; font-weight: 800; letter-spacing: .02em; }
    .band .n { font-size: 15px; opacity: .9; text-align: right; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; line-height: 1.6; }
    .cols h4 { margin: 0 0 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: #166534; }
    th { border-bottom-color: #14532d; }
    .pix { margin-top: 20px; border: 1.5px solid #16a34a; border-radius: 10px; padding: 12px 16px; display: flex; gap: 14px; align-items: center; }
    .pix .qr { width: 64px; height: 64px; background: repeating-linear-gradient(45deg,#111 0 4px,#fff 4px 8px), repeating-linear-gradient(-45deg,#111 0 3px,transparent 3px 9px); border: 4px solid #111; }
  `;
  const body = `<div class="page">
    <div class="band"><div><div class="t">FATURA</div><div class="small" style="opacity:.85">Invoice · Prestação de serviços</div></div>
      <div class="n">Nº ${e(x.invoiceNumber ?? '')}<br>Emissão: ${dateNumeric(x.issueDate ?? '')}<br>Vencimento: ${x.dueDate ? dateNumeric(x.dueDate) : '—'}</div></div>
    <div class="cols"><div><h4>Prestador</h4><b>${e(x.issuer.name ?? '')}</b><br>${e(x.issuer.taxId ?? '')}<br>${e(x.issuer.email ?? '')}<br>São Paulo, SP, Brasil</div>
      <div><h4>Tomador</h4><b>${e(ORGANIZATION.legalName)}</b><br>EIN ${e(ORGANIZATION.taxId)}<br>${e(ORGANIZATION_ADDRESS)}</div></div>
    ${itemsTable(x, money, { description: 'Descrição', qty: 'Qtd.', unit: 'Valor unitário', amount: 'Valor' })}
    ${totals(x, money, { subtotal: 'Subtotal', total: `Valor total (${currency})` })}
    <div class="pix"><div class="qr"></div><div><b>Pagamento via Pix</b><br>Chave: <b>${e(x.payout.destination ?? '')}</b><br><span class="small muted">Favor enviar o comprovante para ${e(x.issuer.email ?? '')}</span></div></div>
    ${extrasHtml(bill)}
    <div class="footer">${FICTITIOUS}</div></div>`;
  return shell(`Fatura ${x.invoiceNumber}`, css, body);
}

// ---------------------------------------------------------------------------- Estados Unidos

function invoiceUS(bill: DatasetBill) {
  const x = bill.truth;
  const p = x.payout;
  const payment =
    p.method === 'card'
      ? `This invoice will be charged to the card on file (${e(p.bankName ?? 'Visa')} ending in ${e(p.destination ?? '')}).`
      : `Please pay by ${p.method === 'ach' ? 'ACH' : 'wire transfer'} to <b>${e(p.bankName ?? '')}</b>, account <b>${e(p.destination ?? '')}</b>, account holder ${e(p.accountHolder ?? x.issuer.name ?? '')}.`;
  const css = `
    .head { display: flex; justify-content: space-between; align-items: flex-start; }
    .logo { display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 800; }
    .logo .mark { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg,#4f46e5,#06b6d4); }
    .inv { text-align: right; }
    .inv .t { font-size: 30px; font-weight: 800; letter-spacing: .04em; color: #4f46e5; }
    .info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 30px 0 22px; font-size: 12.5px; line-height: 1.6; }
    .info h4 { margin: 0 0 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
    .due { margin-top: 18px; background: #eef2ff; border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between; font-size: 14px; }
    .pay { margin-top: 16px; font-size: 12.5px; line-height: 1.6; }
  `;
  const body = `<div class="page">
    <div class="head"><div class="logo"><div class="mark"></div>${e(x.issuer.name ?? '')}</div>
      <div class="inv"><div class="t">INVOICE</div><div># ${e(x.invoiceNumber ?? '')}</div></div></div>
    <div class="info">
      <div><h4>From</h4><b>${e(x.issuer.name ?? '')}</b><br>${e(x.issuer.taxId ?? '')}<br>${e(x.issuer.email ?? '')}</div>
      <div><h4>Bill to</h4><b>${e(ORGANIZATION.legalName)}</b><br>EIN ${e(ORGANIZATION.taxId)}<br>${e(AP_EMAIL)}</div>
      <div><h4>Dates</h4>Issued: ${dateEn(x.issueDate ?? '')}<br>Due: ${x.dueDate ? dateEn(x.dueDate) : 'Upon receipt'}<br>Currency: ${e(x.currency ?? '')}</div>
    </div>
    ${itemsTable(x, moneyUS, { description: 'Description', qty: 'Qty', unit: 'Unit price', amount: 'Amount' })}
    ${totals(x, moneyUS, { subtotal: 'Subtotal', total: `Total (${x.currency})` })}
    <div class="due"><span>Amount due</span><b>${e(x.currency ?? '')} ${moneyUS(x.total ?? '0').slice(1)}</b></div>
    <div class="pay">${payment}</div>
    ${extrasHtml(bill)}
    <div class="footer">${FICTITIOUS}</div></div>`;
  return shell(`Invoice ${x.invoiceNumber}`, css, body);
}

// ---------------------------------------------------------------------------- Perú

function reciboPeru(bill: DatasetBill) {
  const x = bill.truth;
  const css = `
    .page { font-size: 12.5px; }
    .frame { border: 1.5px solid #1d2433; }
    .row { display: grid; grid-template-columns: 1.6fr 1fr; }
    .left { padding: 18px 20px; line-height: 1.6; }
    .right { border-left: 1.5px solid #1d2433; padding: 18px 20px; text-align: center; font-weight: 700; line-height: 1.7; }
    .body { border-top: 1.5px solid #1d2433; padding: 18px 20px; line-height: 1.8; }
    .sum { margin-top: 12px; border-top: 1px dashed #9ca3af; padding-top: 12px; }
  `;
  const total = x.total ?? '0';
  const body = `<div class="page"><div class="frame">
    <div class="row"><div class="left"><b style="font-size:15px">${e((x.issuer.name ?? '').toUpperCase())}</b><br>Av. Ejemplo 123, Miraflores, Lima, Perú<br>${e(x.issuer.email ?? '')}</div>
      <div class="right">${e(x.issuer.taxId ?? '')}<br>RECIBO POR HONORARIOS<br>ELECTRÓNICO<br>Nro. ${e(x.invoiceNumber ?? '')}</div></div>
    <div class="body">
      Fecha de emisión: ${dateNumeric(x.issueDate ?? '')} · Fecha de vencimiento: ${x.dueDate ? dateNumeric(x.dueDate) : '—'}<br>
      Recibí de: <b>${e(ORGANIZATION.legalName.toUpperCase())}</b> (no domiciliado) · EIN ${e(ORGANIZATION.taxId)}<br>
      La suma de: <b>${e((x.amountInWords ?? '').toUpperCase())}</b><br>
      Por concepto de: ${e(x.lineItems[0]?.description ?? '')}<br>
      Observación: pago por transferencia a la cuenta interbancaria (CCI) <b>002-193-123456789012-34</b>, ${e(x.payout.bankName ?? '')}.
      <div class="sum">Total por honorarios: <b>${moneyPE(total)}</b><br>Retención (8 %) IR: No aplica<br>Total neto recibido: <b>${moneyPE(total)}</b> (Soles)</div>
    </div></div>
    ${extrasHtml(bill)}
    <div class="footer">${FICTITIOUS}</div></div>`;
  return shell(`Recibo ${x.invoiceNumber}`, css, body);
}

const TEMPLATES = {
  cuenta_cobro_co: cuentaDeCobro,
  factura_co: facturaColombia,
  factura_mx: facturaMexico,
  fatura_br: faturaBrasil,
  invoice_us: invoiceUS,
  recibo_pe: reciboPeru,
} as const;

export function renderBillHtml(bill: DatasetBill): string {
  const template = bill.document.template;
  if (!template) throw new Error(`${bill.id} has no template`);
  return TEMPLATES[template](bill);
}

/** Wraps a rendered bill as if it were photographed with a phone on a desk. */
export function photoHtml(innerHtml: string): string {
  const inner = innerHtml.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '');
  const styles = /<style>([\s\S]*?)<\/style>/.exec(innerHtml)?.[1] ?? '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
    html, body { margin: 0; width: 1100px; height: 1400px; overflow: hidden; }
    body { background: radial-gradient(ellipse at 30% 20%, #8b6a4b 0%, #6b4f37 45%, #4a3626 100%); }
    .desk { position: absolute; inset: 0; background: repeating-linear-gradient(92deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px); }
    .shot { position: absolute; left: 96px; top: 70px; transform: perspective(1600px) rotateX(5deg) rotateZ(-2.2deg) scale(1.08); transform-origin: 50% 0;
      box-shadow: 0 30px 60px rgba(0,0,0,.45), 0 6px 14px rgba(0,0,0,.3); filter: saturate(.92) brightness(1.02) contrast(.97); }
    .light { position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,250,235,.0) 30%, rgba(255,250,235,.16) 55%, rgba(0,0,0,.08) 100%); pointer-events: none; }
  </style></head><body><div class="desk"></div><div class="shot">${inner}</div><div class="light"></div></body></html>`;
}
