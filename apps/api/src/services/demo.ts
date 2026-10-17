/**
 * Demo mode (F12): seeds Andes Labs, replays the scripted months with the team's actions
 * interleaved by timestamp, launches live files and attacks. Only available with DEMO_MODE.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import {
  AGENTS,
  ATTACKS,
  INITIAL_POLICY,
  LIVE,
  MANDATES,
  MONTHS,
  ORGANIZATION,
  PAYEES,
  SCRIPT,
  TREASURY_BALANCE_USD_CENTS,
  USER_TITLES,
  USERS,
  filePath,
  type DatasetBill,
  type ScriptAction,
} from '@mandato/dataset';
import type { Requester } from '@mandato/domain';
import type { Tx } from '../db/client';
import * as schema from '../db/schema';
import { AppError, newId, notFound, sha256, sleep } from '../lib/common';
import { authenticateAgent, requestPayment } from './agents';
import { approveInvoice, rejectInvoice } from './approvals';
import type { Deps } from './deps';
import { ingestInvoice } from './invoices';
import { appendLedger, SYSTEM_ACTOR, type LedgerAppend } from './ledger';
import { acceptProposal, rejectProposal, updatePayeeDestination } from './registry';

export const DEMO_ORG_ID = ORGANIZATION.id;
const SEEDED_AT = '2026-07-31T12:00:00-05:00';

const ORG_TABLES = [
  schema.auditRuns,
  schema.ledgerEntries,
  schema.proposals,
  schema.agents,
  schema.decisions,
  schema.invoices,
  schema.documents,
  schema.mandates,
  schema.payees,
  schema.policies,
  schema.users,
  schema.approvalRequests,
] as const;

function assertDemo(deps: Deps) {
  if (!deps.config.DEMO_MODE)
    throw new AppError(403, 'demo_disabled', 'El modo demo está desactivado.');
}

async function wipe(tx: Tx, orgId: string) {
  const requests = await tx
    .select({ id: schema.approvalRequests.id })
    .from(schema.approvalRequests)
    .where(eq(schema.approvalRequests.orgId, orgId));
  const ids = requests.map((r) => r.id);
  if (ids.length) {
    await tx.delete(schema.approvals).where(inArray(schema.approvals.requestId, ids));
    await tx.delete(schema.approvalLinks).where(inArray(schema.approvalLinks.requestId, ids));
  }
  for (const table of ORG_TABLES) {
    await tx.delete(table).where(eq(table.orgId, orgId));
  }
  await tx.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}

/** Drops the demo organization and seeds Andes Labs as of 31 July 2026 (development only). */
export async function resetDemo(deps: Deps): Promise<void> {
  assertDemo(deps);
  const at = new Date(SEEDED_AT).toISOString();
  await deps.db.transaction(async (tx) => {
    await wipe(tx, DEMO_ORG_ID);
    await tx.insert(schema.organizations).values({
      id: ORGANIZATION.id,
      name: ORGANIZATION.name,
      legalName: ORGANIZATION.legalName,
      taxId: ORGANIZATION.taxId,
      aliases: ORGANIZATION.aliases,
      timeZone: ORGANIZATION.timeZone,
      treasuryBalanceUsdCents: TREASURY_BALANCE_USD_CENTS,
      invoiceSeq: 0,
      createdAt: new Date(at),
    });
    const entries: LedgerAppend[] = [
      {
        type: 'ORG_SEEDED',
        entityId: ORGANIZATION.id,
        actor: SYSTEM_ACTOR,
        at,
        payload: {
          organization: ORGANIZATION,
          treasuryBalanceUsdCents: TREASURY_BALANCE_USD_CENTS,
        },
      },
    ];
    for (const user of USERS) {
      await tx.insert(schema.users).values({
        id: user.id,
        orgId: ORGANIZATION.id,
        name: user.name,
        email: user.email,
        title: USER_TITLES[user.id] ?? '',
        role: user.role,
        canApprove: user.canApprove,
        canSign: user.canSign,
      });
      entries.push({
        type: 'USER_REGISTERED',
        entityId: user.id,
        actor: SYSTEM_ACTOR,
        at,
        payload: { user },
      });
    }
    await tx.insert(schema.policies).values({
      id: newId('pol'),
      orgId: ORGANIZATION.id,
      version: 1,
      terms: INITIAL_POLICY,
      note: 'Política inicial firmada por Martín Ocampo.',
      createdBy: 'usr_martin',
      createdAt: new Date(at),
    });
    entries.push({
      type: 'POLICY_VERSION_CREATED',
      entityId: 'policy:1',
      actor: { kind: 'user', id: 'usr_martin', name: 'Martín Ocampo' },
      at,
      payload: {
        version: 1,
        terms: INITIAL_POLICY,
        note: 'Política inicial firmada por Martín Ocampo.',
      },
    });
    for (const payee of PAYEES) {
      await tx.insert(schema.payees).values({
        id: payee.id,
        orgId: ORGANIZATION.id,
        data: payee,
        createdAt: new Date(at),
        updatedAt: new Date(at),
      });
      entries.push({
        type: 'PAYEE_REGISTERED',
        entityId: payee.id,
        actor: SYSTEM_ACTOR,
        at,
        payload: { payee },
      });
    }
    for (const mandate of MANDATES) {
      await tx.insert(schema.mandates).values({
        id: mandate.id,
        orgId: ORGANIZATION.id,
        key: mandate.key,
        version: mandate.version,
        payeeId: mandate.payeeId,
        status: mandate.status,
        data: mandate,
        createdAt: new Date(mandate.signedAt),
      });
      entries.push({
        type: 'MANDATE_SIGNED',
        entityId: mandate.id,
        actor: { kind: 'user', id: 'usr_martin', name: 'Martín Ocampo' },
        at,
        payload: { mandate, supersedes: null },
      });
    }
    for (const agent of AGENTS) {
      const key =
        agent.id === 'agt_compras' && process.env.AGENT_DEMO_KEY
          ? process.env.AGENT_DEMO_KEY
          : agent.demoKey;
      await tx.insert(schema.agents).values({
        id: agent.id,
        orgId: ORGANIZATION.id,
        name: agent.name,
        description: agent.description,
        keyHash: sha256(key),
        scope: agent.scope,
        status: 'active',
        createdAt: new Date(at),
      });
      entries.push({
        type: 'AGENT_REGISTERED',
        entityId: agent.id,
        actor: SYSTEM_ACTOR,
        at,
        payload: { agent: { id: agent.id, name: agent.name, scope: agent.scope } },
      });
    }
    await appendLedger(tx, ORGANIZATION.id, entries);
  });
  deps.bus.publish({
    type: 'demo.reset',
    orgId: DEMO_ORG_ID,
    at: deps.clock.now().toISOString(),
    data: {},
  });
}

export async function isSeeded(deps: Deps): Promise<boolean> {
  const [org] = await deps.db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, DEMO_ORG_ID));
  return Boolean(org);
}

function requesterFor(bill: DatasetBill): Requester {
  if (bill.source === 'email') return { kind: 'system', name: 'Correo pagos@andeslabs.example' };
  if (bill.source === 'chat') return { kind: 'system', name: 'WhatsApp de finanzas' };
  if (bill.source === 'attack') return { kind: 'system', name: 'Laboratorio de ataques' };
  return { kind: 'user', userId: 'usr_laura', name: 'Laura Méndez' };
}

async function invoiceForDatasetBill(deps: Deps, billId: string) {
  const [row] = await deps.db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.orgId, DEMO_ORG_ID), eq(schema.invoices.datasetId, billId)));
  return row ?? null;
}

export async function ingestDatasetBill(deps: Deps, bill: DatasetBill, at?: string) {
  const existing = await invoiceForDatasetBill(deps, bill.id);
  if (existing) return { invoiceId: existing.id, ref: existing.ref, created: false };
  const bytes = await readFile(filePath(bill));
  return ingestInvoice(deps, {
    orgId: DEMO_ORG_ID,
    source: bill.source,
    requester: requesterFor(bill),
    document: { bytes, filename: basename(bill.file), mediaType: bill.mediaType },
    at,
    datasetId: bill.id,
    title: bill.title,
  });
}

export async function applyScriptAction(deps: Deps, action: ScriptAction): Promise<void> {
  if (action.kind === 'update_payee_destination') {
    await updatePayeeDestination(deps, {
      orgId: DEMO_ORG_ID,
      payeeId: action.payeeId,
      userId: action.userId,
      destination: action.destination,
      note: action.note,
      at: action.at,
    });
    return;
  }
  const invoice = await invoiceForDatasetBill(deps, action.bill);
  if (!invoice) throw notFound(`La factura ${action.bill}`);
  const base = { orgId: DEMO_ORG_ID, invoiceId: invoice.id, userId: action.userId, at: action.at };
  switch (action.kind) {
    case 'approve':
      if (invoice.status !== 'PENDING_APPROVAL') return;
      await approveInvoice(deps, { ...base, note: action.note });
      return;
    case 'reject':
      if (invoice.status !== 'PENDING_APPROVAL') return;
      await rejectInvoice(deps, { ...base, note: action.note });
      return;
    case 'accept_proposal':
    case 'reject_proposal': {
      const [proposal] = await deps.db
        .select()
        .from(schema.proposals)
        .where(
          and(eq(schema.proposals.invoiceId, invoice.id), eq(schema.proposals.status, 'pending')),
        );
      if (!proposal) return;
      if (action.kind === 'accept_proposal') {
        await acceptProposal(deps, {
          orgId: DEMO_ORG_ID,
          proposalId: proposal.id,
          userId: action.userId,
          at: action.at,
        });
      } else {
        await rejectProposal(deps, {
          orgId: DEMO_ORG_ID,
          proposalId: proposal.id,
          userId: action.userId,
          note: action.note,
          at: action.at,
        });
      }
    }
  }
}

/**
 * Processes one scripted month: its bills and (optionally) the team's actions, interleaved by
 * timestamp exactly as they happened, so budgets and frequencies match the evaluation.
 */
export async function runMonth(
  deps: Deps,
  period: string,
  options: { withTeam?: boolean; paceMs?: number } = {},
): Promise<{ processed: number; actions: number }> {
  assertDemo(deps);
  const month = MONTHS.find((m) => m.period === period);
  if (!month) throw notFound(`El mes ${period}`);
  const withTeam = options.withTeam ?? true;
  const pace = options.paceMs ?? deps.config.DEMO_PACE_MS;
  type Event = { at: number; bill?: DatasetBill; action?: ScriptAction };
  const events: Event[] = [
    ...month.bills.map((bill) => ({ at: Date.parse(bill.receivedAt), bill })),
    ...(withTeam ? SCRIPT.filter((a) => a.at.startsWith(period)) : []).map((action) => ({
      at: Date.parse(action.at),
      action,
    })),
  ].sort((a, b) => a.at - b.at);

  let processed = 0;
  let actions = 0;
  for (const event of events) {
    if (event.bill) {
      const result = await ingestDatasetBill(deps, event.bill, event.bill.receivedAt);
      if (result.created) processed++;
    } else if (event.action) {
      await applyScriptAction(deps, event.action);
      actions++;
    }
    deps.bus.publish({
      type: 'demo.progress',
      orgId: DEMO_ORG_ID,
      at: deps.clock.now().toISOString(),
      data: {
        period,
        step: event.bill?.id ?? event.action?.kind ?? '',
        processed,
        actions,
        total: events.length,
      },
    });
    if (pace > 0) await sleep(pace);
  }
  return { processed, actions };
}

export async function runLiveFile(deps: Deps, id: string) {
  assertDemo(deps);
  const bill = LIVE.find((b) => b.id === id);
  if (!bill) throw notFound(`El archivo ${id}`);
  return ingestDatasetBill(deps, bill);
}

export async function launchAttack(deps: Deps, id: string, at?: string) {
  assertDemo(deps);
  const attack = ATTACKS.find((a) => a.id === id);
  if (!attack) throw notFound(`El ataque ${id}`);
  const results: { invoiceId: string; ref: string; created: boolean }[] = [];
  for (const bill of attack.bills) {
    results.push(await ingestDatasetBill(deps, bill, at));
  }
  if (attack.agentRequest) {
    const seed = AGENTS.find((a) => a.id === attack.agentRequest!.agentId);
    if (!seed) throw notFound('El agente');
    const key = process.env.AGENT_DEMO_KEY ?? seed.demoKey;
    const agent = await authenticateAgent(deps, `Bearer ${key}`);
    const view = await requestPayment(deps, agent, attack.agentRequest.payload, at);
    results.push({ invoiceId: view.id, ref: view.referencia, created: true });
  }
  return { attack: attack.id, results };
}

/** What the demo can do, plus what has already been processed. */
export async function demoCatalog(deps: Deps) {
  const rows = await deps.db
    .select({
      id: schema.invoices.id,
      datasetId: schema.invoices.datasetId,
      outcome: schema.invoices.outcome,
      status: schema.invoices.status,
      ref: schema.invoices.ref,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.orgId, DEMO_ORG_ID));
  const processed = new Map(rows.filter((r) => r.datasetId).map((r) => [r.datasetId!, r]));
  const describe = (bill: DatasetBill) => ({
    id: bill.id,
    title: bill.title,
    note: bill.note,
    trap: bill.trap,
    format: bill.document.format,
    file: basename(bill.file),
    receivedAt: bill.receivedAt,
    expected: bill.expected,
    invoice: processed.get(bill.id) ?? null,
  });
  return {
    seeded: await isSeeded(deps),
    months: MONTHS.map((m) => ({
      period: m.period,
      label: m.label,
      bills: m.bills.map(describe),
      actions: SCRIPT.filter((a) => a.at.startsWith(m.period)).length,
    })),
    live: LIVE.map(describe),
    attacks: ATTACKS.map((a) => ({
      id: a.id,
      title: a.title,
      attempt: a.attempt,
      caughtBy: a.caughtBy,
      bills: a.bills.map(describe),
      agentRequest: a.agentRequest ? { agentId: a.agentRequest.agentId } : null,
    })),
  };
}

export async function datasetFile(id: string) {
  const bill = [
    ...MONTHS.flatMap((m) => m.bills),
    ...LIVE,
    ...ATTACKS.flatMap((a) => a.bills),
  ].find((b) => b.id === id);
  if (!bill) throw notFound(`El archivo ${id}`);
  return {
    bytes: await readFile(filePath(bill)),
    filename: basename(bill.file),
    mediaType: bill.mediaType,
  };
}
