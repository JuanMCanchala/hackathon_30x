import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { localDate } from '@mandato/domain';
import { loadOrganization } from '../../services/context';
import type { Deps } from '../../services/deps';
import { listPayments, runPayments, treasuryOf } from '../../services/payments';
import { currentUser } from '../context';
import { ok } from '../openapi';

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
}
