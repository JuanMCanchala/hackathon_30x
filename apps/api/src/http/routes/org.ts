import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import type { Container } from '../../container';
import { reconciliationView } from '../../services/reconciliation';
import { conversations, overview, paymentsView, vendorsView } from '../../services/views';
import { ok } from '../openapi';

export function registerOrgRoutes(app: OpenAPIHono, c: Container, demoMode: boolean) {
  const get = (path: string, tag: string, summary: string, view: () => Promise<unknown>) =>
    app.openapi(
      createRoute({ method: 'get', path, tags: [tag], summary, responses: ok(summary) }),
      async (ctx) => ctx.json((await view()) as object, 200),
    );

  get(
    '/api/v1/overview',
    'Panel',
    'Marcador, invariantes, cuentas por estado y actividad reciente',
    () => overview(c.deps),
  );
  get(
    '/api/v1/vendors',
    'Proveedores',
    'Proveedores con sus contratos y el destino de pago enmascarado',
    () => vendorsView(c.deps),
  );
  get(
    '/api/v1/conversations',
    'Proveedores',
    'Bandeja simulada: una conversación por caso con el proveedor',
    () => conversations(c.deps, { portalLinks: demoMode }),
  );
  get('/api/v1/payments', 'Pagos', 'Pagos en orden de creación, con su plan de riel y fecha', () =>
    paymentsView(c.deps),
  );
  get(
    '/api/v1/reconciliation',
    'Pagos',
    'Extracto de Blinka conciliado: línea ↔ pago ↔ cuenta ↔ contrato ↔ evidencia',
    () => reconciliationView(c.deps),
  );
}
