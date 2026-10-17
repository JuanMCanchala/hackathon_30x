import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { DemoService } from '../../services/demo';
import { ok } from '../openapi';

const ActionParam = z.object({
  action: z
    .enum(['arrive-october', 'reply-daniela', 'accept-brand-kit', 'merge-pr', 'close-october'])
    .openapi({ param: { name: 'action', in: 'path' } }),
});

export function registerDemoRoutes(app: OpenAPIHono, demo: DemoService) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/demo/tour',
      tags: ['Demo'],
      summary: 'Fase del recorrido guiado y acciones disponibles',
      responses: ok('Recorrido'),
    }),
    async (ctx) => ctx.json(await demo.tourState(), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/demo/reset',
      tags: ['Demo'],
      summary: 'Reinicia Altamar Labs al 1 de octubre, con septiembre ya vivido',
      responses: ok('Reiniciada'),
    }),
    async (ctx) => {
      await demo.reset();
      return ctx.json(await demo.tourState(), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/demo/actions/{action}',
      tags: ['Demo'],
      summary: 'Ejecuta un paso del recorrido guiado',
      request: { params: ActionParam },
      responses: ok('Acción ejecutada'),
    }),
    async (ctx) => {
      const result = await demo.act(ctx.req.valid('param').action);
      return ctx.json({ ...result, tour: await demo.tourState() }, 200);
    },
  );
}
