import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { adaptTopic, approve, calendar, listAdaptations, unschedule } from '../../services/adapt';
import { submissions, submitPost } from '../../services/community';
import type { Deps } from '../../services/deps';
import { askRadar, evaluationView, referencesView } from '../../services/insights';
import { pipelineStatus, startPipeline } from '../../services/pipeline';
import { radar } from '../../services/radar';
import { exportSnapshot } from '../../services/snapshot';
import { topicDetail } from '../../services/topic';

const PLATFORMS = ['all', 'linkedin', 'instagram', 'youtube', 'tiktok', 'x', 'bluesky'] as const;

const RadarQuery = z.object({
  platform: z.enum(PLATFORMS).default('all'),
  region: z.enum(['global', 'latam']).default('global'),
  untouched: z.enum(['1', '0']).optional(),
  audience: z.enum(['all', '30x']).default('30x'),
});

const AdaptBody = z.object({
  variant: z.number().int().min(0).max(5).default(0),
  /** Writes this version again (after the topic's reading changed). */
  refresh: z.boolean().default(false),
});
const ApproveBody = z.object({
  adaptationId: z.string().min(1),
  format: z.enum(['linkedin', 'carousel', 'reel', 'youtube']),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  approvedBy: z.string().min(1).max(80).default('Equipo de medios 30X'),
});
const SensorBody = z.object({
  url: z.string().min(8).max(500),
  submittedBy: z.string().min(1).max(80).default('Equipo 30X'),
  note: z.string().max(280).optional(),
});
const AskBody = z.object({
  question: z.string().min(3).max(500),
  history: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(4000) }))
    .max(6)
    .optional(),
});

/** The radar's HTTP surface: read the week, open a topic, adapt it, plan it, feed it. */
export function registerRadarRoutes(app: OpenAPIHono, deps: Deps) {
  app.get('/api/v1/radar', async (c) => {
    const q = RadarQuery.parse(c.req.query());
    return c.json(
      await radar(deps, {
        platform: q.platform,
        region: q.region,
        untouched: q.untouched === '1',
        audience: q.audience,
      }),
    );
  });

  app.get('/api/v1/topics/:id', async (c) => {
    const region = c.req.query('region') === 'latam' ? 'latam' : 'global';
    const refresh = c.req.query('refresh') === '1';
    return c.json(await topicDetail(deps, c.req.param('id'), { region }, { refresh }));
  });

  app.get('/api/v1/topics/:id/adaptations', async (c) =>
    c.json(await listAdaptations(deps, c.req.param('id'))),
  );

  app.post('/api/v1/topics/:id/adaptations', async (c) => {
    const body = AdaptBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await adaptTopic(deps, c.req.param('id'), body.variant, body.refresh));
  });

  app.get('/api/v1/calendar', async (c) => c.json(await calendar(deps)));
  app.post('/api/v1/calendar', async (c) =>
    c.json(await approve(deps, ApproveBody.parse(await c.req.json()))),
  );
  app.delete('/api/v1/calendar/:id', async (c) =>
    c.json(await unschedule(deps, c.req.param('id'))),
  );

  app.get('/api/v1/sensor', async (c) => c.json(await submissions(deps)));
  app.post('/api/v1/sensor', async (c) =>
    c.json(await submitPost(deps, SensorBody.parse(await c.req.json()))),
  );

  app.get('/api/v1/references', async (c) => c.json(await referencesView(deps)));
  app.get('/api/v1/evaluation', async (c) => c.json(await evaluationView(deps)));

  app.get('/api/v1/pipeline', (c) => c.json(pipelineStatus()));
  app.post('/api/v1/pipeline/run', async (c) => {
    const body = z
      .object({
        enrich: z.boolean().default(true),
        limit: z.number().int().min(1).max(100_000).optional(),
        rebuild: z.boolean().default(false),
      })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(startPipeline(deps, body), 202);
  });

  // Freezes the current week into SNAPSHOT_DIR, the database the demo starts from.
  app.post('/api/v1/snapshot', async (c) => c.json(await exportSnapshot(deps)));

  app.post('/api/v1/ask', async (c) => {
    const body = AskBody.parse(await c.req.json());
    return c.json(await askRadar(deps, body.question, body.history ?? []));
  });
}
