/**
 * Human approvals (ADR-0012): distinct approvers, dual approval above the threshold, one-time
 * signed links, and the agent's proposal after an approval (ADR-0004).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  isTeachable,
  proposalImpact,
  proposeFromApproval,
  type Decision,
  type PastEscalation,
  type PolicyTerms,
  type RuleId,
} from '@mandato/domain';
import type { Tx } from '../db/client';
import {
  approvalLinks,
  approvalRequests,
  approvals,
  decisions,
  invoices,
  proposals,
  users,
} from '../db/schema';
import { AppError, conflict, forbidden, newId, notFound, randomToken, sha256 } from '../lib/common';
import { currentPolicy, loadMandates, loadPayees } from './context';
import { nowIso, withOrgLock, type Deps } from './deps';
import { appendLedger, SYSTEM_ACTOR, type LedgerAppend } from './ledger';
import { schedulePayment } from './payments';

async function loadUser(tx: Tx, orgId: string, userId: string) {
  const [user] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)));
  if (!user) throw notFound('El usuario');
  return user;
}

async function loadPendingRequest(tx: Tx, orgId: string, invoiceId: string) {
  const [request] = await tx
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.invoiceId, invoiceId), eq(approvalRequests.orgId, orgId)));
  if (!request) throw notFound('La solicitud de aprobación');
  if (request.status !== 'pending') throw conflict('Esta factura ya fue resuelta.');
  return request;
}

export function decisionFromRow(row: typeof decisions.$inferSelect): Decision {
  return {
    outcome: row.outcome,
    results: row.results,
    summary: row.summary,
    counterfactual: row.counterfactual,
    approvalsRequired: row.approvalsRequired as Decision['approvalsRequired'],
    facts: row.facts,
    engineVersion: row.engineVersion,
  };
}

/** Builds and stores the agent's proposal after a bill is approved, if it is teachable. */
async function proposeAfterApproval(
  tx: Tx,
  orgId: string,
  invoice: typeof invoices.$inferSelect,
  approverNames: string[],
  at: string,
): Promise<LedgerAppend[]> {
  const [row] = await tx.select().from(decisions).where(eq(decisions.invoiceId, invoice.id));
  if (!row || !invoice.extraction) return [];
  const decision = decisionFromRow(row);
  if (!isTeachable(decision)) return [];
  const policy = await currentPolicy(tx, orgId);
  const draft = proposeFromApproval({
    decision,
    extraction: invoice.extraction,
    policy: policy.terms as PolicyTerms,
    payees: await loadPayees(tx, orgId),
    mandates: await loadMandates(tx, orgId),
    approvers: approverNames,
    approvedAt: at,
  });
  if (!draft) return [];

  const escalated = await tx
    .select({ invoice: invoices, decision: decisions })
    .from(invoices)
    .innerJoin(decisions, eq(decisions.invoiceId, invoices.id))
    .where(and(eq(invoices.orgId, orgId), eq(invoices.outcome, 'ESCALATE')));
  const past: PastEscalation[] = escalated.map(({ invoice: i, decision: d }) => ({
    issuerTaxIdNorm: i.issuerTaxIdNorm,
    payeeId: i.payeeId,
    destinationNorm: i.destinationNorm,
    failingRules: d.results.filter((r) => r.status === 'fail').map((r) => r.id as RuleId),
    currency: i.currency,
    amountMinor: i.amountMinor,
  }));
  const avoided = proposalImpact(draft, past, {
    payeeId: invoice.payeeId,
    taxIdNorm: invoice.issuerTaxIdNorm,
    destinationNorm: invoice.destinationNorm,
  });

  const proposalId = newId('prp');
  await tx.insert(proposals).values({
    id: proposalId,
    orgId,
    invoiceId: invoice.id,
    status: 'pending',
    draft,
    impact: { avoidedEscalations: avoided },
    createdAt: new Date(at),
  });
  return [
    {
      type: 'PROPOSAL_CREATED',
      entityId: proposalId,
      actor: SYSTEM_ACTOR,
      at,
      payload: { proposalId, invoiceId: invoice.id, title: draft.title },
    },
  ];
}

export interface ApprovalAction {
  orgId: string;
  invoiceId: string;
  userId: string;
  note?: string | null;
  via?: 'web' | 'link';
  at?: string;
}

export interface ApprovalResult {
  status: 'pending' | 'approved' | 'rejected';
  approvals: number;
  required: number;
  proposalId: string | null;
}

export async function approveInvoice(deps: Deps, action: ApprovalAction): Promise<ApprovalResult> {
  const at = nowIso(deps, action.at);
  const result = await withOrgLock(deps.db, action.orgId, async (tx) => {
    const user = await loadUser(tx, action.orgId, action.userId);
    if (!user.canApprove) throw forbidden(`${user.name} no tiene permiso para aprobar pagos.`);
    const request = await loadPendingRequest(tx, action.orgId, action.invoiceId);
    const previous = await tx.select().from(approvals).where(eq(approvals.requestId, request.id));
    if (previous.some((a) => a.userId === user.id)) {
      throw conflict(`${user.name} ya aprobó esta factura; se necesita otra persona.`);
    }
    await tx.insert(approvals).values({
      id: newId('apv'),
      requestId: request.id,
      userId: user.id,
      action: 'approve',
      note: action.note ?? null,
      via: action.via ?? 'web',
      createdAt: new Date(at),
    });
    const entries: LedgerAppend[] = [
      {
        type: 'APPROVAL_GIVEN',
        entityId: action.invoiceId,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: {
          requestId: request.id,
          invoiceId: action.invoiceId,
          userId: user.id,
          via: action.via ?? 'web',
          note: action.note ?? null,
        },
      },
    ];
    const approverIds = [
      ...previous.filter((a) => a.action === 'approve').map((a) => a.userId),
      user.id,
    ];
    let status: ApprovalResult['status'] = 'pending';
    let proposalId: string | null = null;
    if (approverIds.length >= request.required) {
      status = 'approved';
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, action.invoiceId));
      if (!invoice) throw notFound('La factura');
      await tx
        .update(approvalRequests)
        .set({ status: 'approved', resolvedAt: new Date(at) })
        .where(eq(approvalRequests.id, request.id));
      await tx
        .update(invoices)
        .set({ status: 'APPROVED', resolvedAt: new Date(at) })
        .where(eq(invoices.id, invoice.id));
      entries.push({
        type: 'INVOICE_APPROVED',
        entityId: invoice.id,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: {
          invoiceId: invoice.id,
          requestId: request.id,
          usdCents: invoice.usdCents,
          periodKey: invoice.periodKey,
          approvers: approverIds,
        },
      });
      entries.push(...(await schedulePayment(tx, invoice, at)));
      const approverRows = await tx.select().from(users).where(eq(users.orgId, action.orgId));
      const names = approverIds.map((id) => approverRows.find((u) => u.id === id)?.name ?? id);
      const proposalEntries = await proposeAfterApproval(tx, action.orgId, invoice, names, at);
      proposalId = proposalEntries[0]?.entityId ?? null;
      entries.push(...proposalEntries);
    }
    await appendLedger(tx, action.orgId, entries);
    return { status, approvals: approverIds.length, required: request.required, proposalId };
  });

  deps.bus.publish({
    type: result.status === 'approved' ? 'invoice.approved' : 'approval.recorded',
    orgId: action.orgId,
    at,
    data: { invoiceId: action.invoiceId, userId: action.userId, ...result },
  });
  if (result.proposalId) {
    deps.bus.publish({
      type: 'proposal.created',
      orgId: action.orgId,
      at,
      data: { proposalId: result.proposalId, invoiceId: action.invoiceId },
    });
  }
  return result;
}

export async function rejectInvoice(deps: Deps, action: ApprovalAction): Promise<ApprovalResult> {
  const at = nowIso(deps, action.at);
  const result = await withOrgLock(deps.db, action.orgId, async (tx) => {
    const user = await loadUser(tx, action.orgId, action.userId);
    if (!user.canApprove) throw forbidden(`${user.name} no tiene permiso para rechazar pagos.`);
    const request = await loadPendingRequest(tx, action.orgId, action.invoiceId);
    await tx.insert(approvals).values({
      id: newId('apv'),
      requestId: request.id,
      userId: user.id,
      action: 'reject',
      note: action.note ?? null,
      via: action.via ?? 'web',
      createdAt: new Date(at),
    });
    await tx
      .update(approvalRequests)
      .set({ status: 'rejected', resolvedAt: new Date(at) })
      .where(eq(approvalRequests.id, request.id));
    await tx
      .update(invoices)
      .set({ status: 'REJECTED', resolvedAt: new Date(at) })
      .where(eq(invoices.id, action.invoiceId));
    const actor = { kind: 'user' as const, id: user.id, name: user.name };
    await appendLedger(tx, action.orgId, [
      {
        type: 'APPROVAL_REJECTED',
        entityId: action.invoiceId,
        actor,
        at,
        payload: {
          requestId: request.id,
          invoiceId: action.invoiceId,
          userId: user.id,
          note: action.note ?? null,
        },
      },
      {
        type: 'INVOICE_REJECTED',
        entityId: action.invoiceId,
        actor,
        at,
        payload: { invoiceId: action.invoiceId, requestId: request.id, userId: user.id },
      },
    ]);
    return {
      status: 'rejected' as const,
      approvals: 0,
      required: request.required,
      proposalId: null,
    };
  });
  deps.bus.publish({
    type: 'invoice.rejected',
    orgId: action.orgId,
    at,
    data: { invoiceId: action.invoiceId, userId: action.userId },
  });
  return result;
}

// ---------------------------------------------------------------- one-time signed links

interface LinkPayload {
  r: string; // approval request id
  u: string; // approver id
  e: number; // expiry, epoch seconds
  n: string; // nonce
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export async function createApprovalLink(
  deps: Deps,
  input: { orgId: string; invoiceId: string; userId: string },
): Promise<{ token: string; url: string; expiresAt: string }> {
  const { db, config } = deps;
  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(eq(approvalRequests.invoiceId, input.invoiceId), eq(approvalRequests.orgId, input.orgId)),
    );
  if (!request) throw notFound('La solicitud de aprobación');
  if (request.status !== 'pending') throw conflict('Esta factura ya fue resuelta.');
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.userId), eq(users.orgId, input.orgId)));
  if (!user?.canApprove)
    throw forbidden('Solo se generan enlaces para personas que pueden aprobar.');

  const expires = new Date(deps.clock.now().getTime() + config.APPROVAL_LINK_TTL_MINUTES * 60_000);
  const payload: LinkPayload = {
    r: request.id,
    u: user.id,
    e: Math.floor(expires.getTime() / 1000),
    n: randomToken(9),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${body}.${sign(config.APPROVAL_LINK_SECRET, body)}`;
  await db.insert(approvalLinks).values({
    id: newId('lnk'),
    requestId: request.id,
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: expires,
    createdAt: deps.clock.now(),
  });
  return {
    token,
    url: `${config.PUBLIC_WEB_URL}/aprobar/${token}`,
    expiresAt: expires.toISOString(),
  };
}

export interface ResolvedLink {
  linkId: string;
  orgId: string;
  invoiceId: string;
  userId: string;
  userName: string;
  expiresAt: string;
  usedAt: string | null;
}

/** Verifies signature, expiry and single use. Never trusts the token's content without the HMAC. */
export async function resolveApprovalLink(deps: Deps, token: string): Promise<ResolvedLink> {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new AppError(401, 'invalid_link', 'El enlace no es válido.');
  const expected = sign(deps.config.APPROVAL_LINK_SECRET, body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(401, 'invalid_link', 'El enlace no es válido.');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LinkPayload;
  const [link] = await deps.db
    .select()
    .from(approvalLinks)
    .where(eq(approvalLinks.tokenHash, sha256(token)));
  if (!link || link.requestId !== payload.r || link.userId !== payload.u) {
    throw new AppError(401, 'invalid_link', 'El enlace no es válido.');
  }
  const [request] = await deps.db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, link.requestId));
  const [user] = await deps.db.select().from(users).where(eq(users.id, link.userId));
  if (!request || !user) throw new AppError(401, 'invalid_link', 'El enlace no es válido.');
  return {
    linkId: link.id,
    orgId: request.orgId,
    invoiceId: request.invoiceId,
    userId: user.id,
    userName: user.name,
    expiresAt: link.expiresAt.toISOString(),
    usedAt: link.usedAt?.toISOString() ?? null,
  };
}

export async function actOnApprovalLink(
  deps: Deps,
  token: string,
  action: 'approve' | 'reject',
  note: string | null,
): Promise<ApprovalResult> {
  const link = await resolveApprovalLink(deps, token);
  if (link.usedAt) throw new AppError(409, 'link_used', 'Este enlace ya se usó.');
  if (new Date(link.expiresAt).getTime() < deps.clock.now().getTime()) {
    throw new AppError(401, 'link_expired', 'Este enlace venció.');
  }
  // Mark used first: a replayed link fails even if the approval below races with another one.
  const updated = await deps.db
    .update(approvalLinks)
    .set({ usedAt: deps.clock.now() })
    .where(and(eq(approvalLinks.id, link.linkId), isNull(approvalLinks.usedAt)))
    .returning({ id: approvalLinks.id, usedAt: approvalLinks.usedAt });
  if (updated.length !== 1) throw new AppError(409, 'link_used', 'Este enlace ya se usó.');
  const input = {
    orgId: link.orgId,
    invoiceId: link.invoiceId,
    userId: link.userId,
    note,
    via: 'link' as const,
  };
  return action === 'approve' ? approveInvoice(deps, input) : rejectInvoice(deps, input);
}
