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

/** No person approved or rejected it: the engine decided, and nothing waits for a person. */
async function decidedByTheAgent(page: Page) {
  await expect(page.getByText('Decidido por el motor')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Te toca decidir' })).toHaveCount(0);
  await expect(page.locator('article')).not.toContainText(/ (aprobó|rechazó)/);
}

test('the demo path: October arrives, the vendors answer, the month closes clean', async ({
  page,
  context,
}) => {
  await page.goto('/recorrido');
  const reset = page.waitForResponse(
    (r) => r.url().endsWith('/demo/reset') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Reiniciar la demo' }).click();
  expect((await reset).ok()).toBe(true);
  await expect(phase(page)).toHaveText('Septiembre cerrado');
  await expect(page.getByRole('button', { name: 'Llegan las cuentas de octubre' })).toBeEnabled();

  await page.getByRole('button', { name: 'Llegan las cuentas de octubre' }).click();
  await expect(phase(page)).toHaveText('Octubre en curso', { timeout: 60_000 });
  await receiptStatus(page, 'oct-03', 'Pagada en parte');

  // Daniela answers through the real portal, as the vendor
  // her thread: the one conversation with a portal link that is Daniela's
  const openPortal = page
    .getByRole('listitem')
    .filter({ has: page.getByText('Daniela Ospina', { exact: true }) })
    .getByRole('link', { name: /Abrir como proveedor/ });
  await expect(async () => {
    await page.goto('/conversaciones');
    await expect(openPortal).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const portalPromise = context.waitForEvent('page');
  await openPortal.click();
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
  // the 92 h with proof, paid once: nothing more is paid for the correction
  await expect(page.locator('dt', { hasText: 'Ya pagado' }).locator('+ dd')).toHaveText(
    'COP 11.960.000',
  );
  await decidedByTheAgent(page);

  await page.goto('/recorrido');
  await page.getByRole('button', { name: 'Lina acepta el Brand kit v2' }).click();
  await receiptStatus(page, 'oct-04', 'Pagada');

  await page.goto('/recorrido');
  await page.getByRole('button', { name: /Fusionar el PR #3/ }).click();
  await receiptStatus(page, 'oct-05', 'Pagada');
  // the decision cites the pull request, and the line's evidence is that PR, merged
  await expect(page.locator('article > header')).toContainText('app-movil#3');
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'PR fusionado' })
      .filter({ hasText: 'app-movil#3' })
      // the evidence row itself, not the line that lists it
      .filter({ hasNot: page.getByRole('listitem') }),
  ).toHaveCount(1);
  await decidedByTheAgent(page);

  await page.goto('/recorrido');
  await page.getByRole('button', { name: 'Cierre de octubre y extracto de Blinka' }).click();
  await expect(phase(page)).toHaveText('Octubre cerrado', { timeout: 60_000 });
  // Daniela's portal reply counts as her tour step: the close skipped nothing
  await expect(page.getByText('Pasos que la demo saltó')).toHaveCount(0);

  await page.goto('/conciliacion');
  // the bank statement's lines, not the totals above them
  const statement = page.locator('section[aria-labelledby="extracto"]');
  const line = (description: string) =>
    statement.getByRole('listitem').filter({ hasText: description });
  await expect(line('DEVOLUCION PIX')).toContainText('BEATRIZ LIMA');
  await expect(line('DEVOLUCION PIX')).toContainText('Devuelta');
  await expect(line('VISA *CUMBRE CLOUD')).toContainText('Sin conciliar');

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
