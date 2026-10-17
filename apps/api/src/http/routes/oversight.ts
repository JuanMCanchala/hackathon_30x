import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { llmSettings } from '../../config';
import { agents, users } from '../../db/schema';
import { latestAudit, runAudit } from '../../services/audit';
import type { Deps } from '../../services/deps';
import { readLedger } from '../../services/ledger';
import { overview } from '../../services/metrics';
import { reconciliationCsv } from '../../services/reconciliation';
import { listLedger } from '../../services/views';
import { currentUser } from '../context';
import { ok } from '../openapi';

export function registerOversightRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/session',
      tags: ['Sesión'],
      summary: 'Usuario actual, usuarios de la demo y capacidades del servidor',
      responses: ok('Sesión'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const team = await deps.db.select().from(users).where(eq(users.orgId, user.orgId));
      const llm = llmSettings(deps.config);
      return c.json(
        {
          user,
          users: team.map((u) => ({
            id: u.id,
            name: u.name,
            title: u.title,
            canApprove: u.canApprove,
            canSign: u.canSign,
          })),
          demoMode: deps.config.DEMO_MODE,
          reader: {
            name: deps.extractor.name,
            live: llm !== null && deps.config.READER === 'auto',
            provider: llm?.provider ?? null,
            model: llm?.model ?? null,
          },
          policyCompiler: Boolean(deps.policyCompiler),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/overview',
      tags: ['Panel'],
      summary: 'Panel: autonomía por mes, presupuesto, saldo, pendientes y última auditoría',
      responses: ok('Resumen'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await overview(deps, user.orgId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/audit',
      tags: ['Auditoría'],
      summary: 'Corre el auditor independiente sobre el registro encadenado',
      responses: ok('Informe de auditoría'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await runAudit(deps, user.orgId, { id: user.id, name: user.name }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/audit/latest',
      tags: ['Auditoría'],
      summary: 'Último informe de auditoría',
      responses: ok('Informe'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await latestAudit(deps, user.orgId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/ledger',
      tags: ['Auditoría'],
      summary: 'Asientos del registro, del más reciente al más antiguo',
      request: {
        query: z.object({
          limit: z.coerce.number().int().min(1).max(500).optional(),
          before: z.coerce.number().int().positive().optional(),
        }),
      },
      responses: ok('Asientos'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await listLedger(deps.db, user.orgId, c.req.valid('query')), 200);
    },
  );

  app.get('/api/v1/ledger/export.json', async (c) => {
    const user = await currentUser(deps, c);
    const entries = await readLedger(deps.db, user.orgId);
    return c.body(JSON.stringify(entries, null, 2), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mandato-registro.json"',
    });
  });

  app.get('/api/v1/reconciliation.csv', async (c) => {
    const user = await currentUser(deps, c);
    return c.body(await reconciliationCsv(deps.db, user.orgId), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mandato-conciliacion.csv"',
    });
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/agents',
      tags: ['Agentes'],
      summary: 'Agentes externos conectados y su permiso',
      responses: ok('Agentes'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const rows = await deps.db.select().from(agents).where(eq(agents.orgId, user.orgId));
      return c.json(
        rows.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          scope: a.scope,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
        })),
        200,
      );
    },
  );
}
