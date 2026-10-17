import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { ask } from '../../services/ask';
import type { Deps } from '../../services/deps';
import { draftReply } from '../../services/reply';
import { currentUser } from '../context';
import { IdParam, json, ok } from '../openapi';

/** The language model writing for people: answers and drafts. It never acts. */
export function registerAssistantRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/ask',
      tags: ['Asistente'],
      summary: 'Pregúntale a Mandato: responde sobre cobros, pagos y acuerdos citando comprobantes',
      request: {
        body: json(
          z.object({
            question: z.string().min(3).max(500),
            history: z
              .array(z.object({ question: z.string().max(500), answer: z.string().max(4000) }))
              .max(6)
              .optional(),
          }),
        ),
      },
      responses: ok('Respuesta'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const body = c.req.valid('json');
      return c.json(await ask(deps, user.orgId, body.question, body.history ?? []), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/invoices/{id}/reply-draft',
      tags: ['Asistente'],
      summary: 'Redacta la respuesta al proveedor a partir de los motivos de la decisión',
      request: {
        params: IdParam,
        body: json(z.object({ channel: z.enum(['whatsapp', 'email']).default('email') })),
      },
      responses: ok('Borrador'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const { channel } = c.req.valid('json');
      return c.json(await draftReply(deps, user.orgId, c.req.valid('param').id, channel), 200);
    },
  );
}
