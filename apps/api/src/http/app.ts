import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { AppError } from '../lib/common';
import type { Deps } from '../services/deps';
import { rateLimit, requireAdmin } from './guard';
import { registerEventRoutes } from './routes/events';
import { registerRadarRoutes } from './routes/radar';
import { registerWatchRoutes } from './routes/watch';

export function createApp(deps: Deps) {
  const app = new OpenAPIHono();
  const webOrigin = new URL(deps.config.PUBLIC_WEB_URL).origin;

  app.use(
    '*',
    cors({
      // The browser reaches the API through the web app's proxy; only that origin may call it.
      origin: (origin) => (origin === webOrigin ? origin : null),
      allowHeaders: ['content-type', 'authorization'],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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

  app.get('/api/v1/health', (c) => c.json({ ok: true }));
  registerEventRoutes(app, deps);
  // One budget per visitor across every route that calls a paid model.
  const guards = { admin: requireAdmin(deps), paid: rateLimit(deps) };
  registerRadarRoutes(app, deps, guards);
  registerWatchRoutes(app, deps, guards);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Radar 30X API',
      version: '1.0.0',
      description:
        'Qué temas de IA están despegando en redes, por qué funcionan y cómo los cuenta 30X. Reto Radar de contenido, Hackathon 30X.',
    },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Radar 30X API' }));

  return app;
}
