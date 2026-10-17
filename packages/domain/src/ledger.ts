/** Ledger entry types (ADR-0006). The ledger is append-only and hash-chained per organization. */
export type LedgerEntryType =
  | 'ORG_SEEDED'
  | 'USER_REGISTERED'
  | 'POLICY_VERSION_CREATED'
  | 'PAYEE_REGISTERED'
  | 'PAYEE_UPDATED'
  | 'MANDATE_SIGNED'
  | 'MANDATE_REVOKED'
  | 'AGENT_REGISTERED'
  | 'INVOICE_RECEIVED'
  | 'INVOICE_EXTRACTED'
  | 'DECISION_RECORDED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_GIVEN'
  | 'APPROVAL_REJECTED'
  | 'INVOICE_APPROVED'
  | 'INVOICE_REJECTED'
  | 'PROPOSAL_CREATED'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_REJECTED'
  | 'AUDIT_RUN';

export interface LedgerActor {
  kind: 'user' | 'agent' | 'system';
  id: string;
  name: string;
}

/** The part of an entry covered by its hash. */
export interface LedgerEntryBody {
  orgId: string;
  type: LedgerEntryType;
  entityId: string | null;
  actor: LedgerActor;
  payload: unknown;
  at: string;
}

export interface LedgerEntry extends LedgerEntryBody {
  seq: number;
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

/** Deterministic JSON: object keys sorted, `undefined` dropped, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('canonicalJson: non-finite number');
    }
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Text that is hashed for an entry: previous hash, newline, canonical body. */
export function hashInput(prevHash: string, body: LedgerEntryBody): string {
  return `${prevHash}\n${canonicalJson({
    orgId: body.orgId,
    type: body.type,
    entityId: body.entityId,
    actor: body.actor,
    payload: body.payload,
    at: body.at,
  })}`;
}

export type HashFn = (input: string) => string;
