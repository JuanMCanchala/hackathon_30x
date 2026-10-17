import { asc, desc, eq } from 'drizzle-orm';
import {
  GENESIS_HASH,
  hashInput,
  type LedgerActor,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerPayloads,
} from '@mandato/domain';
import type { Executor, Tx } from '../db/client';
import { ledgerEntries } from '../db/schema';
import { sha256 } from '../lib/common';

export interface LedgerAppend<T extends LedgerEntryType = LedgerEntryType> {
  type: T;
  entityId: string | null;
  actor: LedgerActor;
  payload: LedgerPayloads[T];
  at: string;
}

export const SYSTEM_ACTOR: LedgerActor = { kind: 'system', id: 'mandato', name: 'Mandato' };

/**
 * Appends hash-chained entries (ADR-0006). Must run inside the organization lock
 * (ADR-0011) so the chain stays linear.
 */
export async function appendLedger(tx: Tx, orgId: string, entries: LedgerAppend[]): Promise<void> {
  if (entries.length === 0) return;
  const [last] = await tx
    .select({ hash: ledgerEntries.hash })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.orgId, orgId))
    .orderBy(desc(ledgerEntries.seq))
    .limit(1);
  let prevHash = last?.hash ?? GENESIS_HASH;
  for (const entry of entries) {
    // Round-trip through JSON so what we hash is exactly what JSONB stores and returns.
    const payload = JSON.parse(JSON.stringify(entry.payload)) as unknown;
    const body = {
      orgId,
      type: entry.type,
      entityId: entry.entityId,
      actor: entry.actor,
      payload,
      at: entry.at,
    };
    const hash = sha256(hashInput(prevHash, body));
    await tx.insert(ledgerEntries).values({ ...body, prevHash, hash });
    prevHash = hash;
  }
}

export async function readLedger(db: Executor, orgId: string): Promise<LedgerEntry[]> {
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.orgId, orgId))
    .orderBy(asc(ledgerEntries.seq));
  return rows.map((r) => ({
    seq: r.seq,
    orgId: r.orgId,
    type: r.type as LedgerEntryType,
    entityId: r.entityId,
    actor: r.actor,
    payload: r.payload,
    at: r.at,
    prevHash: r.prevHash,
    hash: r.hash,
  }));
}
