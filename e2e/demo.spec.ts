import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const DANIELA_CORRECTED = fileURLToPath(
  new URL(
    '../packages/dataset/files/octubre/oct-03-r1-daniela-ospina-cuenta-corregida.pdf',
    import.meta.url,
  ),
);

test.describe.configure({ mode: 'serial' });

/** The demo phase the tour marks as current. */
const phase = (page: Page) =>
  page.getByRole('list', { name: 'Fases de la demo' }).locator('[aria-current="step"]');

/** The status chip in a receipt's header. */
const receiptStatus = (page: Page, id: string, status: string) =>
  expect(async () => {
    await page.goto(`/cuentas/${id}`);
    await expect(page.locator('article > header').getByText(status, { exact: true })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });

test('the demo path: October arrives, the vendors answer, the month closes clean', async ({
  page,
  context,
}) => {
  await page.goto('/recorrido');
  await page.getByRole('button', { name: 'Reiniciar la demo' }).click();
  await expect(page.getByRole('button', { name: 'Reiniciar la demo' })).toBeEnabled();

  await page.getByRole('button', { name: 'Llegan las cuentas de octubre' }).click();
  await expect(phase(page)).toHaveText('Octubre en curso', { timeout: 60_000 });
  await receiptStatus(page, 'oct-03', 'Pagada en parte');

  // Daniela answers through the real portal, as the vendor
  await page.goto('/conversaciones');
  const thread = page.getByRole('listitem').filter({ hasText: 'Daniela' }).first();
  const portalPromise = context.waitForEvent('page');
  await thread.getByRole('link', { name: /Abrir como proveedor/ }).click();
  const portal = await portalPromise;
  await expect(portal.getByRole('heading', { name: 'Hola, Daniela' })).toBeVisible();
  await portal
    .getByRole('textbox', { name: 'Tu mensaje' })
    .fill('Te adjunto la cuenta corregida por las 92 h registradas.');
  await portal.locator('input[type="file"]').setInputFiles(DANIELA_CORRECTED);
  await portal.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(portal.getByRole('status')).toContainText('Recibimos tu respuesta');
  await portal.close();
  // the original is replaced by the corrected version, which is paid in full
  await receiptStatus(page, 'oct-03', 'Reemplazada');
  await page.getByRole('link', { name: 'Ver la versión vigente' }).click();
  await expect(page.locator('article > header').getByText('Pagada', { exact: true })).toBeVisible();

  await page.goto('/recorrido');
  await page.getByRole('button', { name: 'Lina acepta el Brand kit v2' }).click();
  await receiptStatus(page, 'oct-04', 'Pagada');

  await page.goto('/recorrido');
  await page.getByRole('button', { name: /Fusionar el PR #3/ }).click();
  await receiptStatus(page, 'oct-05', 'Pagada');
  // the decision itself cites the merged pull request
  await expect(page.locator('article > header')).toContainText('#3');

  await page.goto('/recorrido');
  await page.getByRole('button', { name: 'Cierre de octubre y extracto de Blinka' }).click();
  await expect(phase(page)).toHaveText('Octubre cerrado', { timeout: 60_000 });

  await page.goto('/conciliacion');
  // the bank statement's lines, not the totals above them
  const statement = page.locator('section[aria-labelledby="extracto"]');
  await expect(statement.getByText('Devuelta', { exact: true }).first()).toBeVisible();
  await expect(statement.getByText('Sin conciliar', { exact: true }).first()).toBeVisible();

  await page.goto('/resumen');
  await expect(
    page.getByText('Pagos indebidos', { exact: true }).locator('xpath=following-sibling::p[1]'),
  ).toHaveText('0');
});

test('the landing states the promise; an unreadable amount cannot be approved', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ningún pago sin prueba de entrega.' }),
  ).toBeVisible();

  await page.goto('/cuentas/oct-19');
  await expect(page.getByText(/No se puede aprobar/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar el pago' })).toHaveCount(0);
});
