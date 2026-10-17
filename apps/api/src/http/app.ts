import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { AppError } from '../lib/common';
import type { Deps } from '../services/deps';
import { registerAgentRoutes } from './routes/agent';
import { registerDemoRoutes } from './routes/demo';
import { registerGovernanceRoutes } from './routes/governance';
import { registerInvoiceRoutes } from './routes/invoices';
import { registerOversightRoutes } from './routes/oversight';

export function createApp(deps: Deps) {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: {
              code: 'validation_error',
              message: 'La solicitud no es válida.',
              issues: result.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
              })),
            },
          },
          400,
        );
      }
    },
  });

  app.use(
    '*',
    cors({
      origin: (origin) => origin ?? '*',
      allowHeaders: ['content-type', 'authorization', 'x-mandato-user'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'validation_error',
            message: 'La solicitud no es válida.',
            issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        },
        400,
      );
    }
    console.error(error);
    return c.json({ error: { code: 'internal_error', message: 'Error interno.' } }, 500);
  });

  app.get('/api/v1/health', (c) => c.json({ ok: true, demoMode: deps.config.DEMO_MODE }));

  registerOversightRoutes(app, deps);
  registerInvoiceRoutes(app, deps);
  registerGovernanceRoutes(app, deps);
  registerAgentRoutes(app, deps);
  if (deps.config.DEMO_MODE) registerDemoRoutes(app, deps);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Mandato API',
      version: '1.0.0',
      description:
        'Agente de cuentas por pagar: paga lo acordado y le pregunta a una persona todo lo demás. Reto Blinka · Hackathon 30X.',
    },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Mandato API' }));

  return app;
}
