import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Container } from '../../container';
import { binary, formFile, formText, multipart, ok } from '../openapi';

const TokenParam = z.object({
  token: z
    .string()
    .min(1)
    .max(200)
    .openapi({ param: { name: 'token', in: 'path' } }),
});

export function registerPortalRoutes(app: OpenAPIHono, c: Container) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/portal/{token}',
      tags: ['Portal del proveedor'],
      summary: 'Lo que ve el proveedor: su cuenta, los mensajes y lo que falta',
      request: { params: TokenParam },
      responses: ok('Vista del portal'),
    }),
    async (ctx) => ctx.json(await c.portalView(ctx.req.valid('param').token), 200),
  );

  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/api/v1/portal/{token}/reply',
    tags: ['Portal del proveedor'],
    summary: 'El proveedor responde con un mensaje y, si quiere, la cuenta corregida',
    request: {
      params: TokenParam,
      body: multipart({ message: z.string().max(5000), file: binary().optional() }),
    },
    responses: { 200: { description: 'Respuesta recibida y caso decidido de nuevo' } },
  });
  app.post('/api/v1/portal/:token/reply', async (ctx) => {
    const message = (await formText(ctx, 'message')).slice(0, 5000);
    const file = await formFile(ctx, 'file', false);
    const { billId, decision } = await c.vendorReply(ctx.req.param('token'), { message, file });
    return ctx.json({ billId, outcome: decision.outcome, summary: decision.summary }, 200);
  });
}
