import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { documents } from '../../db/schema';
import { mediaTypeFor, parseChat, parseEmail } from '../../extraction/prepare';
import { AppError, notFound } from '../../lib/common';
import {
  actOnApprovalLink,
  approveInvoice,
  createApprovalLink,
  rejectInvoice,
  resolveApprovalLink,
} from '../../services/approvals';
import type { Deps } from '../../services/deps';
import { ingestInvoice } from '../../services/invoices';
import { getInvoiceDetail, listInvoices, listPendingApprovals } from '../../services/views';
import { currentUser } from '../context';
import { IdParam, json, NoteBody, ok } from '../openapi';

const InvoiceQuery = z.object({
  status: z.enum(['pagadas', 'frenadas', 'pendientes', 'rechazadas']).optional(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  q: z.string().max(100).optional(),
  source: z.enum(['upload', 'email', 'chat', 'agent', 'dataset', 'attack']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

async function documentOf(deps: Deps, orgId: string, invoiceId: string) {
  const detail = await getInvoiceDetail(deps.db, orgId, invoiceId);
  if (!detail.document) throw notFound('El documento');
  const [doc] = await deps.db.select().from(documents).where(eq(documents.id, detail.document.id));
  if (!doc) throw notFound('El documento');
  return { doc, bytes: await deps.documents.get(doc.storagePath) };
}

export function registerInvoiceRoutes(app: OpenAPIHono, deps: Deps) {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/invoices',
      tags: ['Facturas'],
      summary: 'Lista facturas por estado, periodo o búsqueda',
      request: { query: InvoiceQuery },
      responses: ok('Facturas'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await listInvoices(deps.db, user.orgId, c.req.valid('query')), 200);
    },
  );

  // Upload: multipart (`file`) or pasted text (`{ text, channel }`).
  app.post('/api/v1/invoices', async (c) => {
    const user = await currentUser(deps, c);
    const contentType = c.req.header('content-type') ?? '';
    let document: { bytes: Buffer; filename: string; mediaType: string };
    let source: 'upload' | 'chat' | 'email' = 'upload';
    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!(file instanceof File))
        throw new AppError(400, 'bad_request', 'Adjunta un archivo en el campo «file».');
      const filename = file.name || 'documento';
      const declared = file.type && file.type !== 'application/octet-stream' ? file.type : '';
      document = {
        bytes: Buffer.from(await file.arrayBuffer()),
        filename,
        mediaType: declared || mediaTypeFor(filename),
      };
      if (document.mediaType === 'message/rfc822') source = 'email';
    } else {
      const body = z
        .object({
          text: z.string().min(5).max(20_000),
          channel: z.enum(['chat', 'email']).default('chat'),
        })
        .parse(await c.req.json());
      source = body.channel;
      document = {
        bytes: Buffer.from(body.text, 'utf8'),
        filename: `mensaje-${Date.now()}.txt`,
        mediaType: 'text/plain',
      };
    }
    const result = await ingestInvoice(deps, {
      orgId: user.orgId,
      source,
      requester: { kind: 'user', userId: user.id, name: user.name },
      document,
    });
    return c.json(result, result.created ? 201 : 200);
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/invoices/{id}',
      tags: ['Facturas'],
      summary: 'Recibo completo de una decisión: reglas, contrafactual, aprobaciones y registro',
      request: { params: IdParam },
      responses: ok('Detalle de la factura'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await getInvoiceDetail(deps.db, user.orgId, c.req.valid('param').id), 200);
    },
  );

  app.get('/api/v1/invoices/:id/document', async (c) => {
    const user = await currentUser(deps, c);
    const { doc, bytes } = await documentOf(deps, user.orgId, c.req.param('id'));
    const inline = doc.mediaType === 'application/pdf' || doc.mediaType.startsWith('image/');
    const type = inline
      ? doc.mediaType
      : doc.mediaType === 'message/rfc822'
        ? 'message/rfc822'
        : 'text/plain; charset=utf-8';
    return c.body(new Uint8Array(bytes), 200, {
      'Content-Type': type,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.filename)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    });
  });

  app.get('/api/v1/invoices/:id/document/view', async (c) => {
    const user = await currentUser(deps, c);
    const { doc, bytes } = await documentOf(deps, user.orgId, c.req.param('id'));
    if (doc.mediaType === 'message/rfc822') {
      const { raw: _raw, ...email } = await parseEmail(bytes);
      return c.json(email, 200);
    }
    if (doc.mediaType.startsWith('text/')) return c.json(parseChat(bytes.toString('utf8')), 200);
    return c.json({ kind: doc.mediaType === 'application/pdf' ? 'pdf' : 'image' }, 200);
  });

  app.get('/api/v1/invoices/:id/document/attachments/:index', async (c) => {
    const user = await currentUser(deps, c);
    const { doc, bytes } = await documentOf(deps, user.orgId, c.req.param('id'));
    if (doc.mediaType !== 'message/rfc822') throw notFound('El adjunto');
    const email = await parseEmail(bytes);
    const index = Number(c.req.param('index'));
    const meta = email.attachments[index];
    const content = email.raw[index];
    if (!meta || !content) throw notFound('El adjunto');
    const inline = meta.mediaType === 'application/pdf' || meta.mediaType.startsWith('image/');
    return c.body(new Uint8Array(content), 200, {
      'Content-Type': inline ? meta.mediaType : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(meta.filename)}"`,
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/invoices/{id}/approve',
      tags: ['Aprobaciones'],
      summary: 'Aprueba una factura escalada (usuario con permiso de aprobación)',
      request: { params: IdParam, body: json(NoteBody) },
      responses: ok('Resultado de la aprobación'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const { note } = c.req.valid('json');
      const result = await approveInvoice(deps, {
        orgId: user.orgId,
        invoiceId: c.req.valid('param').id,
        userId: user.id,
        note: note ?? null,
      });
      return c.json(result, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/invoices/{id}/reject',
      tags: ['Aprobaciones'],
      summary: 'Rechaza una factura escalada',
      request: { params: IdParam, body: json(NoteBody) },
      responses: ok('Resultado del rechazo'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const { note } = c.req.valid('json');
      const result = await rejectInvoice(deps, {
        orgId: user.orgId,
        invoiceId: c.req.valid('param').id,
        userId: user.id,
        note: note ?? null,
      });
      return c.json(result, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/invoices/{id}/approval-links',
      tags: ['Aprobaciones'],
      summary: 'Genera un enlace firmado de un solo uso para aprobar desde el celular',
      request: { params: IdParam, body: json(z.object({ userId: z.string().min(1) })) },
      responses: ok('Enlace de aprobación'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      const link = await createApprovalLink(deps, {
        orgId: user.orgId,
        invoiceId: c.req.valid('param').id,
        userId: c.req.valid('json').userId,
      });
      return c.json(link, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/approvals',
      tags: ['Aprobaciones'],
      summary: 'Cola de facturas pendientes de aprobación',
      responses: ok('Pendientes'),
    }),
    async (c) => {
      const user = await currentUser(deps, c);
      return c.json(await listPendingApprovals(deps.db, user.orgId), 200);
    },
  );

  // Signed one-time links: the token is the capability, no session header needed.
  app.get('/api/v1/approval-links/:token', async (c) => {
    const link = await resolveApprovalLink(deps, c.req.param('token'));
    const detail = await getInvoiceDetail(deps.db, link.orgId, link.invoiceId);
    return c.json(
      {
        approver: { id: link.userId, name: link.userName },
        expiresAt: link.expiresAt,
        usedAt: link.usedAt,
        expired: new Date(link.expiresAt).getTime() < deps.clock.now().getTime(),
        invoice: {
          id: detail.id,
          ref: detail.ref,
          title: detail.title,
          status: detail.status,
          payee: detail.payee ? { name: detail.payee.name, country: detail.payee.country } : null,
          issuerName: detail.issuerName,
          invoiceNumber: detail.invoiceNumber,
          amountMinor: detail.amountMinor,
          currency: detail.currency,
          usdCents: detail.usdCents,
          dueDate: detail.dueDate,
          summary: detail.decision?.summary ?? null,
          counterfactual: detail.decision?.counterfactual ?? [],
          failing: (detail.decision?.results ?? [])
            .filter((r) => r.status === 'fail')
            .map((r) => ({ title: r.title, detail: r.detail })),
          approval: detail.approval
            ? {
                required: detail.approval.required,
                approvals: detail.approval.approvals.map((a) => ({
                  name: a.name,
                  action: a.action,
                  at: a.at,
                })),
              }
            : null,
        },
      },
      200,
    );
  });

  app.post('/api/v1/approval-links/:token', async (c) => {
    const body = z
      .object({
        action: z.enum(['approve', 'reject']),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(await c.req.json());
    const result = await actOnApprovalLink(
      deps,
      c.req.param('token'),
      body.action,
      body.note ?? null,
    );
    return c.json(result, 200);
  });

  // Real-time updates (ADR-0014).
  app.get('/api/v1/events', async (c) => {
    const user = await currentUser(deps, c);
    return streamSSE(c, async (stream) => {
      const unsubscribe = deps.bus.subscribe((event) => {
        if (event.orgId !== user.orgId) return;
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      stream.onAbort(() => unsubscribe());
      await stream.writeSSE({ event: 'ready', data: '{}' });
      while (!stream.aborted) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: 'ping', data: '{}' });
      }
      unsubscribe();
    });
  });
}
