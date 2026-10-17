import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { localDate, periodKeyOf } from '@mandato/domain';
import { closeCsv, monthClose } from '../../services/close';
import { loadOrganization } from '../../services/context';
import type { Deps } from '../../services/deps';
import { listPayments, runPayments, treasuryOf } from '../../services/payments';
import { currentUser } from '../context';
import { ok } from '../openapi';

async function currentPeriodOf(deps: Deps, orgId: string): Promise<string> {
  const org = await loadOrganization(deps.db, orgId);
  return periodKeyOf(deps.clock.now().toISOString(), org.timeZone);
}

/** Transfers (ADR-0018): the schedule, what went out and the cash it leaves. */
export function registerPaymentRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/payments',
      tags: ['Pagos'],
      summary: 'Transferencias programadas, enviadas y liquidadas, y el saldo que dejan',
      responses: ok('Pagos'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const org = await loadOrganization(deps.db, user.orgId);
      const today = localDate(deps.clock.now().toISOString(), org.timeZone);
      return c.json(
        {
          today,
          items: await listPayments(deps.db, user.orgId),
          treasury: await treasuryOf(deps.db, user.orgId),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/payments/run',
      tags: ['Pagos'],
      summary: 'Envía las transferencias que vencen hoy y liquida las que ya llegaron',
      responses: ok('Transferencias movidas'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await runPayments(deps, user.orgId, deps.clock.now().toISOString()), 200);
    },
  );

  const PeriodQuery = z.object({
    period: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .openapi({ param: { name: 'period', in: 'query' }, example: '2026-09' }),
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/close',
      tags: ['Pagos'],
      summary:
        'Cierre del mes: cada cobro con su resultado, quién lo decidió, por qué y su transferencia',
      request: { query: PeriodQuery },
      responses: ok('Cierre del mes'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const current = await currentPeriodOf(deps, user.orgId);
      return c.json(
        await monthClose(deps.db, user.orgId, c.req.valid('query').period, current),
        200,
      );
    },
  );

  app.get('/api/v1/close.csv', async (c) => {
    const user = await currentUser(deps, c);
    const period = c.req.query('period');
    const close = await monthClose(
      deps.db,
      user.orgId,
      period && /^\d{4}-\d{2}$/.test(period) ? period : undefined,
      await currentPeriodOf(deps, user.orgId),
    );
    return c.body(closeCsv(close), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mandato-cierre-${close.period}.csv"`,
    });
  });
}
