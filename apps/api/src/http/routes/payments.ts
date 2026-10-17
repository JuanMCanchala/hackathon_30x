import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { localDate } from '@mandato/domain';
import { loadOrganization } from '../../services/context';
import type { Deps } from '../../services/deps';
import { listPayments, runPayments } from '../../services/payments';
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
      const items = await listPayments(deps.db, user.orgId);
      const usd = (status: string) =>
        items.filter((p) => p.status === status).reduce((s, p) => s + (p.usdCents ?? 0), 0);
      const scheduledUsd = usd('scheduled');
      const outUsd = usd('sent') + usd('settled');
      const balance = org.treasuryBalanceUsdCents - outUsd;
      return c.json(
        {
          today,
          items,
          treasury: {
            openingUsdCents: org.treasuryBalanceUsdCents,
            sentUsdCents: outUsd,
            balanceUsdCents: balance,
            scheduledUsdCents: scheduledUsd,
            afterScheduledUsdCents: balance - scheduledUsd,
          },
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
