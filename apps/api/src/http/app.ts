import { timingSafeEqual } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Container } from '../container';
import type { DemoService } from '../services/demo';
import { ServiceError } from '../services/state';
import { MAX_UPLOAD_BYTES } from './openapi';
import { registerBillRoutes } from './routes/bills';
import { registerDemoRoutes } from './routes/demo';
import { registerEvidenceRoutes } from './routes/evidence';
import { registerOrgRoutes } from './routes/org';
import { registerPortalRoutes } from './routes/portal';

const MULTIPART = [/^\/api\/v1\/bills$/, /^\/api\/v1\/portal\/[^/]+\/reply$/];
const SELF_AUTHENTICATED = [/^\/api\/v1\/portal\/[^/]+\/reply$/, /^\/api\/v1\/webhooks\/github$/];

export function createApp(c: Container, demo: DemoService | null) {
  const app = new OpenAPIHono({
    defaultHook: (result, ctx) => {
      if (!result.success) return ctx.json({ error: 'La solicitud no es válida.' }, 400);
    },
  });

  // only the web app; same-origin requests need no CORS header
  app.use(
    '*',
    cors({
      origin: (origin) => (origin === c.config.publicWebUrl ? origin : null),
      allowHeaders: ['content-type', 'authorization', 'x-hub-signature-256', 'x-github-event'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  // 1 MB for JSON and CSV; a multipart form carries a 10 MB file plus the form's own bytes
  const small = bodyLimit({
    maxSize: 1024 * 1024,
    onError: (ctx) => ctx.json({ error: 'La solicitud supera 1 MB.' }, 413),
  });
  const large = bodyLimit({
    maxSize: MAX_UPLOAD_BYTES + 256 * 1024,
    onError: (ctx) => ctx.json({ error: 'El archivo supera los 10 MB.' }, 413),
  });
  app.use('/api/v1/*', (ctx, next) =>
    ctx.req.method === 'POST' && MULTIPART.some((r) => r.test(ctx.req.path))
      ? large(ctx, next)
      : small(ctx, next),
  );

  // Outside demo mode every write needs the admin token, except the routes that authenticate
  // themselves: the vendor portal (its link token) and the GitHub webhook (its signature).
  if (!c.config.demoMode) {
    const expected = Buffer.from(`Bearer ${c.config.adminToken}`);
    app.use('/api/v1/*', async (ctx, next) => {
      const write = !['GET', 'HEAD', 'OPTIONS'].includes(ctx.req.method);
      if (write && !SELF_AUTHENTICATED.some((r) => r.test(ctx.req.path))) {
        const given = Buffer.from(ctx.req.header('authorization') ?? '');
        if (given.length !== expected.length || !timingSafeEqual(given, expected))
          return ctx.json({ error: 'Falta la clave de administrador o no es válida.' }, 401);
      }
      return next();
    });
  }

  app.onError((error, ctx) => {
    if (error instanceof ServiceError)
      return ctx.json({ error: error.message }, error.status as ContentfulStatusCode);
    if (error instanceof HTTPException)
      return ctx.json({ error: 'La solicitud no es válida.' }, error.status);
    console.error(error);
    return ctx.json({ error: 'Error interno.' }, 500);
  });
  app.notFound((ctx) => ctx.json({ error: 'No existe.' }, 404));

  app.get('/api/v1/health', (ctx) =>
    ctx.json({
      ok: true,
      demoMode: c.config.demoMode,
      reader: c.config.reader,
      llm: c.config.llm.provider,
      githubLive: c.config.github.repo !== null,
    }),
  );

  registerOrgRoutes(app, c, demo !== null);
  registerBillRoutes(app, c);
  registerPortalRoutes(app, c);
  registerEvidenceRoutes(app, c);
  if (demo) registerDemoRoutes(app, demo);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Recibido API',
      version: '1.0.0',
      description:
        'Agente de cuentas por pagar que paga una cuenta de servicios solo por el trabajo que puede probar entregado. Reto Blinka · Hackathon 30X.',
    },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Recibido API' }));
  return app;
}
