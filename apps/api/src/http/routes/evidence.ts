import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Container } from '../../container';
import { actorOf, IdParam, json, ok } from '../openapi';

export function registerEvidenceRoutes(app: OpenAPIHono, c: Container) {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/evidence/deliverables/{id}/accept',
      tags: ['Evidencia'],
      summary: 'Una persona del cliente acepta un entregable pendiente',
      request: {
        params: IdParam,
        body: json(z.object({ actor: z.string().max(120).optional() })),
      },
      responses: ok('Entregable aceptado'),
    }),
    async (ctx) =>
      ctx.json(
        await c.acceptDeliverable(
          ctx.req.valid('param').id,
          actorOf(c.config, ctx.req.valid('json').actor),
        ),
        200,
      ),
  );

  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/api/v1/evidence/time-entries',
    tags: ['Evidencia'],
    summary: 'Importa horas en CSV: fecha,proveedor,proyecto,minutos,descripcion',
    request: { body: { content: { 'text/csv': { schema: z.string() } }, required: true } },
    responses: { 200: { description: 'Horas importadas' } },
  });
  app.post('/api/v1/evidence/time-entries', async (ctx) => {
    // the 1 MB body limit applies
    return ctx.json(await c.importTimeEntriesCsv(await ctx.req.text()), 200);
  });

  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/api/v1/webhooks/github',
    tags: ['Evidencia'],
    summary: 'Webhook de GitHub (pull_request) firmado con X-Hub-Signature-256',
    responses: {
      200: { description: 'Evento aceptado' },
      202: { description: 'Evento ignorado' },
      401: { description: 'Firma inválida' },
    },
  });
  app.post('/api/v1/webhooks/github', async (ctx) => {
    const raw = new Uint8Array(await ctx.req.arrayBuffer());
    const result = await c.github.handleWebhook(
      raw,
      ctx.req.header('x-hub-signature-256'),
      ctx.req.header('x-github-event'),
    );
    if (result.accepted) return ctx.json(result, 200);
    if (result.reason === 'bad_signature' || result.reason === 'no_secret')
      return ctx.json({ error: 'Firma del webhook inválida.' }, 401);
    return ctx.json({ ignored: result.reason }, 202);
  });
}
