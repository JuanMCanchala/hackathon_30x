import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  MandateTermsSchema,
  PayoutDestinationSchema,
  PolicyTermsSchema,
  RULE_CATALOG,
  type PolicyTerms,
} from '@mandato/domain';
import { AppError } from '../../lib/common';
import { currentPolicy } from '../../services/context';
import type { Deps } from '../../services/deps';
import { getPolicy, previewPolicy, updatePolicy } from '../../services/policy';
import {
  acceptProposal,
  rejectProposal,
  revokeMandate,
  setPayeeStatus,
  signMandate,
  updatePayeeDestination,
} from '../../services/registry';
import { listMandates, listPayees, listProposals } from '../../services/views';
import { currentUser } from '../context';
import { IdParam, json, NoteBody, ok } from '../openapi';

export function registerGovernanceRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/rules',
      tags: ['Reglas'],
      summary: 'Catálogo de reglas que evalúa el motor',
      responses: ok('Reglas'),
    }),
    (c) => c.json(RULE_CATALOG, 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/policy',
      tags: ['Reglas'],
      summary: 'Política vigente y sus versiones',
      responses: ok('Política'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await getPolicy(deps, user.orgId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/policy/preview',
      tags: ['Reglas'],
      summary: 'Qué habría pasado: reevalúa el historial con la política propuesta',
      request: { body: json(z.object({ terms: PolicyTermsSchema })) },
      responses: ok('Impacto de la política propuesta'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await previewPolicy(deps, user.orgId, c.req.valid('json').terms), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/api/v1/policy',
      tags: ['Reglas'],
      summary: 'Guarda una nueva versión de la política (requiere permiso de firma)',
      request: {
        body: json(
          z.object({ terms: PolicyTermsSchema, note: z.string().max(500).nullable().optional() }),
        ),
      },
      responses: ok('Política guardada'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const body = c.req.valid('json');
      return c.json(
        await updatePolicy(deps, {
          orgId: user.orgId,
          userId: user.id,
          terms: body.terms,
          note: body.note ?? null,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/policy/compile',
      tags: ['Reglas'],
      summary: 'Convierte una regla escrita en español en un cambio validado de la política',
      request: { body: json(z.object({ text: z.string().min(5).max(1000) })) },
      responses: ok('Cambio propuesto e impacto'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      if (!deps.policyCompiler) {
        throw new AppError(
          503,
          'compiler_unavailable',
          'Configura ANTHROPIC_API_KEY para escribir reglas en español.',
        );
      }
      const current = await currentPolicy(deps.db, user.orgId);
      const { patch, terms } = await deps.policyCompiler.compile(
        c.req.valid('json').text,
        current.terms as PolicyTerms,
      );
      const preview = await previewPolicy(deps, user.orgId, terms);
      return c.json({ patch, terms, preview }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/payees',
      tags: ['Registro'],
      summary: 'Beneficiarios registrados con su acuerdo vigente',
      responses: ok('Beneficiarios'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await listPayees(deps.db, user.orgId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/payees/{id}/destination',
      tags: ['Registro'],
      summary: 'Actualiza el destino de pago tras verificarlo por otro canal',
      request: {
        params: IdParam,
        body: json(
          z.object({ destination: PayoutDestinationSchema, note: z.string().min(3).max(500) }),
        ),
      },
      responses: ok('Beneficiario actualizado'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const body = c.req.valid('json');
      return c.json(
        await updatePayeeDestination(deps, {
          orgId: user.orgId,
          payeeId: c.req.valid('param').id,
          userId: user.id,
          destination: body.destination,
          note: body.note,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/payees/{id}/status',
      tags: ['Registro'],
      summary: 'Bloquea o habilita un beneficiario',
      request: {
        params: IdParam,
        body: json(
          z.object({ status: z.enum(['active', 'blocked']), note: z.string().min(3).max(500) }),
        ),
      },
      responses: ok('Beneficiario actualizado'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const body = c.req.valid('json');
      return c.json(
        await setPayeeStatus(deps, {
          orgId: user.orgId,
          payeeId: c.req.valid('param').id,
          userId: user.id,
          status: body.status,
          note: body.note,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/mandates',
      tags: ['Registro'],
      summary: 'Acuerdos firmados (todas las versiones)',
      responses: ok('Acuerdos'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await listMandates(deps.db, user.orgId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/mandates',
      tags: ['Registro'],
      summary: 'Firma un acuerdo nuevo o una nueva versión de uno existente',
      request: {
        body: json(
          z.object({
            payeeId: z.string().min(1),
            terms: MandateTermsSchema,
            supersedes: z.string().nullable().optional(),
          }),
        ),
      },
      responses: ok('Acuerdo firmado'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const body = c.req.valid('json');
      return c.json(
        await signMandate(deps, {
          orgId: user.orgId,
          userId: user.id,
          payeeId: body.payeeId,
          terms: body.terms,
          supersedes: body.supersedes ?? null,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/mandates/{id}/revoke',
      tags: ['Registro'],
      summary: 'Revoca un acuerdo: sus cobros vuelven a pedir aprobación',
      request: { params: IdParam, body: json(z.object({ reason: z.string().min(3).max(500) })) },
      responses: ok('Acuerdo revocado'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      await revokeMandate(deps, {
        orgId: user.orgId,
        userId: user.id,
        mandateId: c.req.valid('param').id,
        reason: c.req.valid('json').reason,
      });
      return c.json({ ok: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/proposals',
      tags: ['Propuestas'],
      summary: 'Propuestas del agente para firmar',
      request: {
        query: z.object({ status: z.enum(['pending', 'accepted', 'rejected']).optional() }),
      },
      responses: ok('Propuestas'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await listProposals(deps.db, user.orgId, c.req.valid('query').status), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/proposals/{id}/accept',
      tags: ['Propuestas'],
      summary: 'Firma la propuesta: crea o actualiza el acuerdo',
      request: { params: IdParam },
      responses: ok('Propuesta firmada'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(
        await acceptProposal(deps, {
          orgId: user.orgId,
          proposalId: c.req.valid('param').id,
          userId: user.id,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/proposals/{id}/reject',
      tags: ['Propuestas'],
      summary: 'Rechaza la propuesta: nada cambia',
      request: { params: IdParam, body: json(NoteBody) },
      responses: ok('Propuesta rechazada'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      await rejectProposal(deps, {
        orgId: user.orgId,
        proposalId: c.req.valid('param').id,
        userId: user.id,
        note: c.req.valid('json').note ?? null,
      });
      return c.json({ ok: true }, 200);
    },
  );
}
