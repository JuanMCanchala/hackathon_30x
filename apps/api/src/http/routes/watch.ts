import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Deps } from '../../services/deps';
import {
  adaptHit,
  createWatch,
  listWatches,
  mediaFile,
  runWatchInBackground,
  stopWatch,
  watchDetail,
} from '../../services/watch';

const FollowBody = z.object({ term: z.string().trim().min(2).max(60) });
const AdaptBody = z.object({ variant: z.number().int().min(0).max(5).default(0) });

/** «Vigía»: follow a topic, see what each search caught and adapt a caught piece. */
export function registerWatchRoutes(app: OpenAPIHono, deps: Deps) {
  app.get('/api/v1/watches', async (c) => c.json(await listWatches(deps)));

  app.post('/api/v1/watches', async (c) => {
    const { term } = FollowBody.parse(await c.req.json());
    const watch = await createWatch(deps, term);
    runWatchInBackground(deps, watch.id);
    return c.json({ id: watch.id, term: watch.term }, 201);
  });

  app.get('/api/v1/watches/:id', async (c) => c.json(await watchDetail(deps, c.req.param('id'))));

  app.post('/api/v1/watches/:id/run', async (c) => {
    const id = c.req.param('id');
    await watchDetail(deps, id);
    return c.json({ started: runWatchInBackground(deps, id) });
  });

  app.delete('/api/v1/watches/:id', async (c) => c.json(await stopWatch(deps, c.req.param('id'))));

  app.post('/api/v1/watches/:id/hits/:item/adapt', async (c) => {
    const { variant } = AdaptBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await adaptHit(deps, c.req.param('id'), c.req.param('item'), variant));
  });

  app.get('/api/v1/media/:item/:n', async (c) => {
    const file = await mediaFile(deps, c.req.param('item'), Number(c.req.param('n')));
    return new Response(new Uint8Array(file), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' },
    });
  });
}
