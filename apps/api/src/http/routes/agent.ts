import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  agentBudget,
  agentPayees,
  AgentPaymentRequestSchema,
  authenticateAgent,
  paymentRequestView,
  requestPayment,
} from '../../services/agents';
import type { Deps } from '../../services/deps';
import { IdParam, json, ok } from '../openapi';

const security = [{ AgentKey: [] }];

/** External agents (MCP gateway, ADR-0013). Agents can request and read; never approve or sign. */
export function registerAgentRoutes(app: OpenAPIHono, deps: Deps) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'AgentKey', {
    type: 'http',
    scheme: 'bearer',
    description: 'API key de un agente externo (ver docs/API.md).',
  });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/agent/v1/payment-requests',
      tags: ['Agentes externos'],
      summary: 'Solicita un pago: se evalúa con las mismas reglas y devuelve el recibo',
      security,
      request: { body: json(AgentPaymentRequestSchema) },
      responses: ok('Decisión y recibo'),
    }),
    async (c) => {
      const agent = await authenticateAgent(deps, c.req.header('authorization'));
      return c.json(await requestPayment(deps, agent, c.req.valid('json')), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/agent/v1/payment-requests/{id}',
      tags: ['Agentes externos'],
      summary: 'Estado de una solicitud propia (p. ej., si una persona ya la aprobó)',
      security,
      request: { params: IdParam },
      responses: ok('Estado'),
    }),
    async (c) => {
      const agent = await authenticateAgent(deps, c.req.header('authorization'));
      return c.json(await paymentRequestView(deps, agent, c.req.valid('param').id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/agent/v1/budget',
      tags: ['Agentes externos'],
      summary: 'Presupuesto disponible del mes y permiso del agente',
      security,
      responses: ok('Presupuesto'),
    }),
    async (c) => {
      const agent = await authenticateAgent(deps, c.req.header('authorization'));
      return c.json(await agentBudget(deps, agent), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/agent/v1/payees',
      tags: ['Agentes externos'],
      summary: 'Beneficiarios registrados (datos de pago enmascarados)',
      security,
      responses: ok('Beneficiarios'),
    }),
    async (c) => {
      const agent = await authenticateAgent(deps, c.req.header('authorization'));
      return c.json(await agentPayees(deps, agent), 200);
    },
  );
}
