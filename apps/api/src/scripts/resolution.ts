/** Who resolved a case, from what happened on its chain (used by the eval). */
import type { BillStatus } from '@recibido/domain';

/**
 * - person: someone acted, or the case ends with one
 * - vendor_reply: the vendor answered (a message or a corrected bill)
 * - vendor_evidence: the agent asked (an ASK VENDOR, or the rest of a PAY PART) and new evidence
 *   then closed the gap (a PR merged, a deliverable accepted, hours synced)
 * - agent: otherwise, including an ask whose gap never closed
 */
export type Resolver = 'agent' | 'vendor_reply' | 'vendor_evidence' | 'person';

const WITH_A_PERSON: BillStatus[] = ['ESCALATED', 'APPROVED', 'REJECTED'];
const GAP_CLOSED: BillStatus[] = ['PAID', 'HELD'];

export function resolverOf(c: {
  final: BillStatus;
  humanAction: boolean;
  vendorMessage: boolean;
  asked: boolean;
}): Resolver {
  if (c.humanAction || WITH_A_PERSON.includes(c.final)) return 'person';
  if (c.vendorMessage) return 'vendor_reply';
  if (c.asked && GAP_CLOSED.includes(c.final)) return 'vendor_evidence';
  return 'agent';
}
