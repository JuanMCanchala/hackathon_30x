import { createHash } from 'node:crypto';
import {
  GENESIS_HASH,
  hashInput,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerPayloads,
} from '../src';

export const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

/** Builds a valid hash-chained ledger in memory, the way the API does. */
export class LedgerBuilder {
  readonly entries: LedgerEntry[] = [];
  private minute = 0;

  append<T extends LedgerEntryType>(
    type: T,
    payload: LedgerPayloads[T],
    entityId: string | null = null,
  ) {
    const prevHash = this.entries.at(-1)?.hash ?? GENESIS_HASH;
    const at = new Date(Date.UTC(2026, 8, 1, 12, this.minute++)).toISOString();
    const body = {
      orgId: 'org_andes',
      type,
      entityId,
      actor: { kind: 'system' as const, id: 'system', name: 'Mandato' },
      payload,
      at,
    };
    const entry: LedgerEntry = {
      ...body,
      seq: this.entries.length + 1,
      prevHash,
      hash: sha256(hashInput(prevHash, body)),
    };
    this.entries.push(entry);
    return entry;
  }
}
