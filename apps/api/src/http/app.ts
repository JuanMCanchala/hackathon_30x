import { OpenAPIHono } from '@hono/zod-openapi';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { AppError } from '../lib/common';
import type { Deps } from '../services/deps';
import { rateLimit, requireAdmin } from './guard';
import { registerEventRoutes } from './routes/events';
import { registerRadarRoutes } from './routes/radar';
import { registerWatchRoutes } from './routes/watch';

export interface AppOptions {
  /** Settles when the demo week is loaded: until then only the health check answers. */
  ready?: Promise<unknown>;
}

export function createApp(deps: Deps, options: AppOptions = {}) {
  const app = new OpenAPIHono();
  let loading = options.ready !== undefined;
  // A failed import ends the process (index.ts); here it only must not go unhandled.
  void options.ready?.then(
    () => (loading = false),
    () => undefined,
  );
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
    // c.req.json() on a body that is not JSON.
    if (error instanceof SyntaxError) {
      return c.json(
        { error: { code: 'bad_request', message: 'El cuerpo de la solicitud no es JSON válido.' } },
        400,
      );
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

  // The platform's health check must pass while the snapshot loads (about 30 s on a cold start).
  app.get('/api/v1/health', (c) => c.json({ ok: true, loading }));
  app.use('/api/*', async (c, next) => {
    if (loading)
      throw new AppError(
        503,
        'loading',
        'El radar está cargando la semana. Intenta en unos segundos.',
      );
    return next();
  });
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
  // Routes are plain app.get/app.post, so the spec above lists none: the contract is written.
  app.get('/docs', async (c) => {
    const text = await readFile(join(deps.config.repoRoot, 'docs/api.md'), 'utf8');
    return c.body(text, 200, { 'content-type': 'text/markdown; charset=utf-8' });
  });

  return app;
}
