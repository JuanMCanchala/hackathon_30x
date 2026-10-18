import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Deps } from '../../services/deps';
import {
  MaquetaBody,
  createMaqueta,
  deleteMaqueta,
  getMaqueta,
  isDemoMaqueta,
  listMaquetas,
  updateMaqueta,
} from '../../services/maquetas';
import type { Guards } from '../guard';

/** «Maquetas»: the post designs the team builds once and reuses on the calendar. */
export function registerMaquetaRoutes(app: OpenAPIHono, deps: Deps, guards: Guards) {
  app.get('/api/v1/maquetas', async (c) => c.json(await listMaquetas(deps)));

  app.get('/api/v1/maquetas/:id', async (c) => c.json(await getMaqueta(deps, c.req.param('id'))));

  app.post('/api/v1/maquetas', guards.writes, async (c) =>
    c.json(await createMaqueta(deps, MaquetaBody.parse(await c.req.json())), 201),
  );

  // Visitors change and remove the maquetas they made; the demo's own need the admin token.
  app.put(
    '/api/v1/maquetas/:id',
    async (c, next) =>
      (await isDemoMaqueta(deps, c.req.param('id')))
        ? guards.admin(c, next)
        : guards.writes(c, next),
    async (c) =>
      c.json(await updateMaqueta(deps, c.req.param('id'), MaquetaBody.parse(await c.req.json()))),
  );

  app.delete(
    '/api/v1/maquetas/:id',
    async (c, next) =>
      (await isDemoMaqueta(deps, c.req.param('id')))
        ? guards.admin(c, next)
        : guards.writes(c, next),
    async (c) => c.json(await deleteMaqueta(deps, c.req.param('id'))),
  );
}
