import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  adaptTopic,
  approve,
  calendar,
  isDemoEntry,
  listAdaptations,
  reschedule,
  unschedule,
} from '../../services/adapt';
import { submissions, submitPost } from '../../services/community';
import type { Deps } from '../../services/deps';
import { askRadar, evaluationView, referencesView } from '../../services/insights';
import { pipelineStatus, startPipeline } from '../../services/pipeline';
import { radar } from '../../services/radar';
import { exportSnapshot } from '../../services/snapshot';
import { topicDetail } from '../../services/topic';
import type { Guards } from '../guard';

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
/** A day that exists: Postgres refuses 2026-02-31, and that would surface as a 500. */
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return t > 0 && new Date(t).toISOString().startsWith(d);
  }, 'No es una fecha válida.');
/** 'HH:MM', 24 h, Bogotá time. */
const Hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** One source: a maqueta, an adaptation (with its format) or a Vigía piece (with its format). */
const ApproveBody = z.object({
  adaptationId: z.string().min(1).optional(),
  format: z.enum(['linkedin', 'carousel', 'reel', 'youtube']).optional(),
  maquetaId: z.string().min(1).optional(),
  watchId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  scheduledFor: Day,
  scheduledTime: Hour.nullable().optional(),
  approvedBy: z.string().min(1).max(80).default('Equipo de medios 30X'),
});
const MoveBody = z.object({
  scheduledFor: Day.optional(),
  scheduledTime: Hour.nullable().optional(),
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
export function registerRadarRoutes(app: OpenAPIHono, deps: Deps, guards: Guards) {
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

  // ?refresh=1 writes the narrative and fit again with the paid model: it counts against the limit.
  app.get(
    '/api/v1/topics/:id',
    (c, next) => (c.req.query('refresh') === '1' ? guards.paid(c, next) : next()),
    async (c) => {
      const region = c.req.query('region') === 'latam' ? 'latam' : 'global';
      const refresh = c.req.query('refresh') === '1';
      return c.json(await topicDetail(deps, c.req.param('id'), { region }, { refresh }));
    },
  );

  app.get('/api/v1/topics/:id/adaptations', async (c) =>
    c.json(await listAdaptations(deps, c.req.param('id'))),
  );

  app.post('/api/v1/topics/:id/adaptations', guards.paid, async (c) => {
    const body = AdaptBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await adaptTopic(deps, c.req.param('id'), body.variant, body.refresh));
  });

  app.get('/api/v1/calendar', async (c) => c.json(await calendar(deps)));
  app.post('/api/v1/calendar', guards.writes, async (c) =>
    c.json(await approve(deps, ApproveBody.parse(await c.req.json()))),
  );
  // Visitors move and remove the pieces they planned; the demo week's own need the admin token.
  app.patch(
    '/api/v1/calendar/:id',
    async (c, next) =>
      (await isDemoEntry(deps, c.req.param('id'))) ? guards.admin(c, next) : guards.writes(c, next),
    async (c) =>
      c.json(await reschedule(deps, c.req.param('id'), MoveBody.parse(await c.req.json()))),
  );
  app.delete(
    '/api/v1/calendar/:id',
    async (c, next) =>
      (await isDemoEntry(deps, c.req.param('id'))) ? guards.admin(c, next) : guards.writes(c, next),
    async (c) => c.json(await unschedule(deps, c.req.param('id'))),
  );

  app.get('/api/v1/sensor', async (c) => c.json(await submissions(deps)));
  app.post('/api/v1/sensor', guards.paid, async (c) =>
    c.json(await submitPost(deps, SensorBody.parse(await c.req.json()))),
  );

  app.get('/api/v1/references', async (c) => c.json(await referencesView(deps)));
  app.get('/api/v1/evaluation', async (c) => c.json(await evaluationView(deps)));

  app.get('/api/v1/pipeline', (c) => c.json(pipelineStatus()));
  app.post('/api/v1/pipeline/run', guards.admin, async (c) => {
    const body = z
      .object({
        enrich: z.boolean().default(true),
        limit: z.number().int().min(1).max(100_000).optional(),
        rebuild: z.boolean().default(false),
        /** Ingest runs younger than 20 minutes too: only when they are known to be finished. */
        force: z.boolean().default(false),
      })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(startPipeline(deps, body), 202);
  });

  // Freezes the current week into SNAPSHOT_DIR, the database the demo starts from.
  app.post('/api/v1/snapshot', guards.admin, async (c) => c.json(await exportSnapshot(deps)));

  app.post('/api/v1/ask', guards.paid, async (c) => {
    const body = AskBody.parse(await c.req.json());
    return c.json(await askRadar(deps, body.question, body.history ?? []));
  });
}
