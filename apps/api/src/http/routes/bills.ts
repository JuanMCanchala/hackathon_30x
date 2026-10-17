import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Container } from '../../container';
import { billList, billReceipt } from '../../services/views';
import { binary, formFile, IdParam, json, multipart, ok } from '../openapi';

const Resolution = z.object({
  action: z.enum(['approve', 'reject']),
  actor: z.string().trim().min(1).max(120),
  note: z.string().max(2000).default(''),
});

export function registerBillRoutes(app: OpenAPIHono, c: Container) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/bills',
      tags: ['Cuentas'],
      summary: 'Cuentas recibidas, la más reciente primero',
      responses: ok('Cuentas'),
    }),
    async (ctx) => ctx.json(await billList(c.deps), 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/bills/{id}',
      tags: ['Cuentas'],
      summary:
        'Recibo de la decisión: lectura, evidencia por línea, chequeos, contrafactual y pagos',
      request: { params: IdParam },
      responses: ok('Recibo'),
    }),
    async (ctx) => ctx.json(await billReceipt(c.deps, ctx.req.valid('param').id), 200),
  );

  // Documented here, handled below: the handler reads the multipart body itself.
  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/api/v1/bills',
    tags: ['Cuentas'],
    summary: 'Sube una cuenta (PDF, .eml o .txt, hasta 10 MB) y la decide',
    request: { body: multipart({ file: binary() }) },
    responses: { 201: { description: 'Cuenta recibida y decidida' } },
  });
  app.post('/api/v1/bills', async (ctx) => {
    const file = (await formFile(ctx, 'file', true))!;
    // always a plain new bill: only the portal, bound to a bill by its token, sends corrections
    const result = await c.ingestDocument({ ...file, receivedAt: await c.clock.now() });
    return ctx.json(
      {
        billId: result.billId,
        duplicateDocument: result.duplicateDocument,
        outcome: result.decision?.outcome ?? null,
        summary: result.decision?.summary ?? null,
      },
      result.duplicateDocument ? 200 : 201,
    );
  });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bills/{id}/resolve',
      tags: ['Cuentas'],
      summary: 'Una persona aprueba o rechaza una cuenta escalada',
      request: { params: IdParam, body: json(Resolution) },
      responses: ok('Resuelta'),
    }),
    async (ctx) => {
      const result = await c.resolveEscalation(ctx.req.valid('param').id, ctx.req.valid('json'));
      return ctx.json(
        { status: result.status, paymentReference: result.payment?.reference ?? null },
        200,
      );
    },
  );
}
