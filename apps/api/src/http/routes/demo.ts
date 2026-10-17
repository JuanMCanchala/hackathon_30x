import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Deps } from '../../services/deps';
import {
  datasetFile,
  demoCatalog,
  launchAttack,
  resetDemo,
  runLiveFile,
  runMonth,
} from '../../services/demo';
import { IdParam, json, ok } from '../openapi';

export function registerDemoRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/demo/catalog',
      tags: ['Demo'],
      summary: 'Meses guiados, archivos en vivo y ataques disponibles',
      responses: ok('Catálogo'),
    }),
    async (c) => c.json(await demoCatalog(deps), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/demo/reset',
      tags: ['Demo'],
      summary: 'Reinicia Andes Labs al 31 de julio de 2026 (solo modo demo)',
      responses: ok('Reiniciado'),
    }),
    async (c) => {
      await resetDemo(deps);
      return c.json({ ok: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/demo/months/{period}/run',
      tags: ['Demo'],
      summary: 'Procesa un mes del set de datos con las acciones del equipo intercaladas',
      request: {
        params: z.object({
          period: z.enum(['2026-08', '2026-09']).openapi({ param: { name: 'period', in: 'path' } }),
        }),
        body: json(
          z.object({
            withTeam: z.boolean().optional(),
            paceMs: z.number().int().min(0).max(5000).optional(),
          }),
        ),
      },
      responses: ok('Mes procesado'),
    }),
    async (c) => {
      const body = c.req.valid('json');
      return c.json(await runMonth(deps, c.req.valid('param').period, body), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/demo/live/{id}',
      tags: ['Demo'],
      summary: 'Sube un archivo de la demo en vivo con el reloj real',
      request: { params: IdParam },
      responses: ok('Factura decidida'),
    }),
    async (c) => c.json(await runLiveFile(deps, c.req.valid('param').id), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/demo/attacks/{id}',
      tags: ['Demo'],
      summary: 'Lanza un ataque del laboratorio contra el agente',
      request: { params: IdParam },
      responses: ok('Resultado del ataque'),
    }),
    async (c) => c.json(await launchAttack(deps, c.req.valid('param').id), 200),
  );

  app.get('/api/v1/demo/files/:id', async (c) => {
    const file = await datasetFile(c.req.param('id'));
    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.mediaType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
      'X-Content-Type-Options': 'nosniff',
    });
  });
}
