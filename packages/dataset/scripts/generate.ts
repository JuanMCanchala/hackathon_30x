/**
 * Renders every dataset bill to its file (PDF, PNG photo, .eml, WhatsApp export).
 *
 *   pnpm dataset:generate            # all bills
 *   pnpm dataset:generate ago-04     # some bills
 *
 * Regenerating a PDF or PNG changes its bytes, so its recorded extraction (keyed by SHA-256)
 * must be re-recorded afterwards: pnpm extractions:record.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { ALL_BILLS, filePath, type DatasetBill } from '../src';
import { buildChatExport, buildEml } from '../src/render/messages';
import { photoHtml, renderBillHtml } from '../src/render/templates';

const BROWSER = process.env.CHROME_PATH ?? '/usr/bin/brave';

async function pdf(browser: Browser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const data = await page.pdf({ width: '816px', height: '1056px', printBackground: true });
  await page.close();
  return Buffer.from(data);
}

async function png(browser: Browser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const data = await page.screenshot({ type: 'png' });
  await page.close();
  return Buffer.from(data);
}

async function render(browser: Browser, bill: DatasetBill): Promise<Buffer> {
  const doc = bill.document;
  switch (doc.format) {
    case 'pdf':
      return pdf(browser, renderBillHtml(bill));
    case 'png':
      return png(
        browser,
        doc.style === 'photo' ? photoHtml(renderBillHtml(bill)) : renderBillHtml(bill),
      );
    case 'eml': {
      if (!doc.email) throw new Error(`${bill.id}: eml without email spec`);
      const attachment = doc.email.attachPdf ? await pdf(browser, renderBillHtml(bill)) : null;
      return Buffer.from(buildEml(bill, doc.email, attachment), 'utf8');
    }
    case 'txt':
      if (!doc.chat) throw new Error(`${bill.id}: txt without chat spec`);
      return Buffer.from(buildChatExport(doc.chat), 'utf8');
  }
}

async function main() {
  const only = process.argv.slice(2);
  const bills = only.length ? ALL_BILLS.filter((b) => only.includes(b.id)) : ALL_BILLS;
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    for (const bill of bills) {
      const target = filePath(bill);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await render(browser, bill));
      console.log(`✓ ${bill.file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
