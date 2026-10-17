/**
 * Payees, mandates and the agent's proposals. Every signature is a new immutable mandate
 * version recorded in the ledger (ADR-0004); the agent itself has no write path here.
 */
import { and, desc, eq } from 'drizzle-orm';
import {
  materializeProposal,
  MandateTermsSchema,
  PayoutDestinationSchema,
  type Mandate,
  type MandateTerms,
  type Payee,
  type PayoutDestination,
} from '@mandato/domain';
import type { Tx } from '../db/client';
import { mandates, payees, proposals, users } from '../db/schema';
import { badRequest, conflict, forbidden, newId, notFound } from '../lib/common';
import { nowIso, withOrgLock, type Deps } from './deps';
import { appendLedger, type LedgerAppend } from './ledger';
import { scheduleForNewPayee } from './payments';

async function signer(tx: Tx, orgId: string, userId: string) {
  const [user] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)));
  if (!user) throw notFound('El usuario');
  if (!user.canSign)
    throw forbidden(`${user.name} no puede firmar acuerdos ni cambiar el registro.`);
  return user;
}

async function insertMandate(tx: Tx, orgId: string, mandate: Mandate, at: string) {
  await tx.insert(mandates).values({
    id: mandate.id,
    orgId,
    key: mandate.key,
    version: mandate.version,
    payeeId: mandate.payeeId,
    status: mandate.status,
    data: mandate,
    createdAt: new Date(at),
  });
}

async function supersede(tx: Tx, mandateId: string) {
  const [row] = await tx.select().from(mandates).where(eq(mandates.id, mandateId));
  if (!row) throw notFound('El acuerdo');
  if (row.status !== 'active')
    throw conflict('El acuerdo que se quería actualizar ya no está activo.');
  await tx
    .update(mandates)
    .set({ status: 'superseded', data: { ...row.data, status: 'superseded' } })
    .where(eq(mandates.id, mandateId));
}

// ------------------------------------------------------------------------ proposals

export async function acceptProposal(
  deps: Deps,
  input: { orgId: string; proposalId: string; userId: string; at?: string },
): Promise<{ mandateId: string; payeeId: string }> {
  const at = nowIso(deps, input.at);
  const result = await withOrgLock(deps.db, input.orgId, async (tx) => {
    const user = await signer(tx, input.orgId, input.userId);
    const [proposal] = await tx
      .select()
      .from(proposals)
      .where(and(eq(proposals.id, input.proposalId), eq(proposals.orgId, input.orgId)));
    if (!proposal) throw notFound('La propuesta');
    if (proposal.status !== 'pending') throw conflict('Esta propuesta ya fue resuelta.');
    const draft = proposal.draft;
    const { payee, mandate, supersedes } = materializeProposal(draft, {
      payeeId: newId('pay'),
      mandateId: newId('man'),
      mandateKey: newId('mkey'),
      signer: { userId: user.id, name: user.name },
      now: at,
    });
    const actor = { kind: 'user' as const, id: user.id, name: user.name };
    const entries: LedgerAppend[] = [];
    if (payee) {
      await tx.insert(payees).values({
        id: payee.id,
        orgId: input.orgId,
        data: payee,
        createdAt: new Date(at),
        updatedAt: new Date(at),
      });
      entries.push({ type: 'PAYEE_REGISTERED', entityId: payee.id, actor, at, payload: { payee } });
    }
    if (supersedes) await supersede(tx, supersedes);
    await insertMandate(tx, input.orgId, mandate, at);
    entries.push({
      type: 'MANDATE_SIGNED',
      entityId: mandate.id,
      actor,
      at,
      payload: { mandate, supersedes },
    });
    await tx
      .update(proposals)
      .set({
        status: 'accepted',
        resolvedAt: new Date(at),
        resolvedBy: user.id,
        resultMandateId: mandate.id,
      })
      .where(eq(proposals.id, proposal.id));
    entries.push({
      type: 'PROPOSAL_ACCEPTED',
      entityId: proposal.id,
      actor,
      at,
      payload: {
        proposalId: proposal.id,
        userId: user.id,
        mandateId: mandate.id,
        payeeId: mandate.payeeId,
      },
    });
    if (payee) entries.push(...(await scheduleForNewPayee(tx, proposal.invoiceId, payee.id, at)));
    await appendLedger(tx, input.orgId, entries);
    return { mandateId: mandate.id, payeeId: mandate.payeeId };
  });
  deps.bus.publish({
    type: 'proposal.resolved',
    orgId: input.orgId,
    at,
    data: { proposalId: input.proposalId, status: 'accepted', ...result },
  });
  return result;
}

export async function rejectProposal(
  deps: Deps,
  input: { orgId: string; proposalId: string; userId: string; note?: string | null; at?: string },
): Promise<void> {
  const at = nowIso(deps, input.at);
  await withOrgLock(deps.db, input.orgId, async (tx) => {
    const user = await signer(tx, input.orgId, input.userId);
    const [proposal] = await tx
      .select()
      .from(proposals)
      .where(and(eq(proposals.id, input.proposalId), eq(proposals.orgId, input.orgId)));
    if (!proposal) throw notFound('La propuesta');
    if (proposal.status !== 'pending') throw conflict('Esta propuesta ya fue resuelta.');
    await tx
      .update(proposals)
      .set({
        status: 'rejected',
        resolvedAt: new Date(at),
        resolvedBy: user.id,
        resolutionNote: input.note ?? null,
      })
      .where(eq(proposals.id, proposal.id));
    await appendLedger(tx, input.orgId, [
      {
        type: 'PROPOSAL_REJECTED',
        entityId: proposal.id,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: { proposalId: proposal.id, userId: user.id, note: input.note ?? null },
      },
    ]);
  });
  deps.bus.publish({
    type: 'proposal.resolved',
    orgId: input.orgId,
    at,
    data: { proposalId: input.proposalId, status: 'rejected' },
  });
}

// ------------------------------------------------------------------------ payees

export async function updatePayeeDestination(
  deps: Deps,
  input: {
    orgId: string;
    payeeId: string;
    userId: string;
    destination: PayoutDestination;
    note: string;
    at?: string;
  },
): Promise<Payee> {
  const at = nowIso(deps, input.at);
  const destination = PayoutDestinationSchema.parse(input.destination);
  if (!input.note.trim()) {
    throw badRequest(
      'Explica cómo verificaste los datos nuevos (por ejemplo, «confirmado por llamada»).',
    );
  }
  const payee = await withOrgLock(deps.db, input.orgId, async (tx) => {
    const user = await signer(tx, input.orgId, input.userId);
    const [row] = await tx
      .select()
      .from(payees)
      .where(and(eq(payees.id, input.payeeId), eq(payees.orgId, input.orgId)));
    if (!row) throw notFound('El beneficiario');
    const updated: Payee = { ...row.data, destination };
    await tx
      .update(payees)
      .set({ data: updated, updatedAt: new Date(at) })
      .where(eq(payees.id, row.id));
    await appendLedger(tx, input.orgId, [
      {
        type: 'PAYEE_UPDATED',
        entityId: row.id,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: {
          payee: updated,
          changes: [
            `Destino de pago: ${row.data.destination.method} ${row.data.destination.value} → ${destination.method} ${destination.value}`,
            `Verificación: ${input.note}`,
          ],
        },
      },
    ]);
    return updated;
  });
  deps.bus.publish({
    type: 'registry.changed',
    orgId: input.orgId,
    at,
    data: { payeeId: input.payeeId },
  });
  return payee;
}

export async function setPayeeStatus(
  deps: Deps,
  input: {
    orgId: string;
    payeeId: string;
    userId: string;
    status: Payee['status'];
    note: string;
    at?: string;
  },
): Promise<Payee> {
  const at = nowIso(deps, input.at);
  const payee = await withOrgLock(deps.db, input.orgId, async (tx) => {
    const user = await signer(tx, input.orgId, input.userId);
    const [row] = await tx
      .select()
      .from(payees)
      .where(and(eq(payees.id, input.payeeId), eq(payees.orgId, input.orgId)));
    if (!row) throw notFound('El beneficiario');
    const updated: Payee = { ...row.data, status: input.status };
    await tx
      .update(payees)
      .set({ data: updated, updatedAt: new Date(at) })
      .where(eq(payees.id, row.id));
    await appendLedger(tx, input.orgId, [
      {
        type: 'PAYEE_UPDATED',
        entityId: row.id,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: {
          payee: updated,
          changes: [`Estado: ${row.data.status} → ${input.status}`, `Motivo: ${input.note}`],
        },
      },
    ]);
    return updated;
  });
  deps.bus.publish({
    type: 'registry.changed',
    orgId: input.orgId,
    at,
    data: { payeeId: input.payeeId },
  });
  return payee;
}

// ------------------------------------------------------------------------ mandates

export async function signMandate(
  deps: Deps,
  input: {
    orgId: string;
    userId: string;
    payeeId: string;
    terms: MandateTerms;
    supersedes?: string | null;
    at?: string;
  },
): Promise<Mandate> {
  const at = nowIso(deps, input.at);
  const terms = MandateTermsSchema.parse(input.terms);
  const mandate = await withOrgLock(deps.db, input.orgId, async (tx) => {
    const user = await signer(tx, input.orgId, input.userId);
    const [payee] = await tx
      .select()
      .from(payees)
      .where(and(eq(payees.id, input.payeeId), eq(payees.orgId, input.orgId)));
    if (!payee) throw notFound('El beneficiario');
    let key = newId('mkey');
    let version = 1;
    if (input.supersedes) {
      const [base] = await tx.select().from(mandates).where(eq(mandates.id, input.supersedes));
      if (!base || base.payeeId !== input.payeeId) throw notFound('El acuerdo a actualizar');
      key = base.key;
      version = base.version + 1;
      await supersede(tx, base.id);
    } else {
      const active = await tx
        .select()
        .from(mandates)
        .where(and(eq(mandates.payeeId, input.payeeId), eq(mandates.status, 'active')));
      if (active.length > 0)
        throw conflict('Este beneficiario ya tiene un acuerdo activo: actualízalo.');
    }
    const created: Mandate = {
      id: newId('man'),
      key,
      version,
      payeeId: input.payeeId,
      status: 'active',
      terms,
      signedBy: [{ userId: user.id, name: user.name, at }],
      source: 'manual',
      signedAt: at,
    };
    await insertMandate(tx, input.orgId, created, at);
    await appendLedger(tx, input.orgId, [
      {
        type: 'MANDATE_SIGNED',
        entityId: created.id,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: { mandate: created, supersedes: input.supersedes ?? null },
      },
    ]);
    return created;
  });
  deps.bus.publish({
    type: 'registry.changed',
    orgId: input.orgId,
    at,
    data: { mandateId: mandate.id },
  });
  return mandate;
}

export async function revokeMandate(
  deps: Deps,
  input: { orgId: string; userId: string; mandateId: string; reason: string; at?: string },
): Promise<void> {
  const at = nowIso(deps, input.at);
  await withOrgLock(deps.db, input.orgId, async (tx) => {
    const user = await signer(tx, input.orgId, input.userId);
    const [row] = await tx
      .select()
      .from(mandates)
      .where(and(eq(mandates.id, input.mandateId), eq(mandates.orgId, input.orgId)));
    if (!row) throw notFound('El acuerdo');
    if (row.status !== 'active') throw conflict('El acuerdo ya no está activo.');
    await tx
      .update(mandates)
      .set({ status: 'revoked', data: { ...row.data, status: 'revoked' } })
      .where(eq(mandates.id, row.id));
    await appendLedger(tx, input.orgId, [
      {
        type: 'MANDATE_REVOKED',
        entityId: row.id,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: { mandateId: row.id, reason: input.reason },
      },
    ]);
  });
  deps.bus.publish({
    type: 'registry.changed',
    orgId: input.orgId,
    at,
    data: { mandateId: input.mandateId },
  });
}

export async function mandateHistory(deps: Deps, orgId: string, key: string) {
  return deps.db
    .select()
    .from(mandates)
    .where(and(eq(mandates.orgId, orgId), eq(mandates.key, key)))
    .orderBy(desc(mandates.version));
}
