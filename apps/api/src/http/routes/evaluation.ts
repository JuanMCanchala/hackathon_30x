import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import type { Deps } from '../../services/deps';
import { latestEvaluation, runEvaluation } from '../../services/evaluation';
import { currentUser } from '../context';
import { ok } from '../openapi';

/** The challenge's own scoring, run on a separate in-memory database (ADR-0015). */
export function registerEvaluationRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/evaluation',
      tags: ['Evaluación'],
      summary: 'La última evaluación del set completo: autonomía, seguridad y explicabilidad',
      responses: ok('Evaluación'),
    }),
    async (c) => {
      await currentUser(deps, c);
      return c.json(await latestEvaluation(), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/evaluation/run',
      tags: ['Evaluación'],
      summary: 'Corre otra vez las 49 facturas en una base aparte; la demo no cambia',
      responses: ok('Evaluación'),
    }),
    async (c) => {
      await currentUser(deps, c);
      return c.json(await runEvaluation(), 200);
    },
  );
}
