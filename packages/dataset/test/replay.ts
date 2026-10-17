/**
 * A minimal in-memory replay of the dataset through the pure engine (no database, perfect
 * reading). The API's evaluation harness does the same through the real services.
 */
import {
  decide,
  materializeProposal,
  normalizeDestination,
  proposeFromApproval,
  scanForAgentInstructions,
  type Decision,
  type HistoryInvoice,
  type Mandate,
  type MandateProposalDraft,
  type Payee,
  type Requester,
} from '@mandato/domain';
import {
  AGENTS,
  INITIAL_POLICY,
  MANDATES,
  ORGANIZATION,
  PAYEES,
  SCRIPT,
  TREASURY_BALANCE_USD_CENTS,
  USERS,
  type DatasetBill,
} from '../src';

export interface ReplayResult {
  bill: DatasetBill;
  decision: Decision;
}

export class Replay {
  payees: Payee[] = PAYEES.map((p) => ({ ...p }));
  mandates: Mandate[] = MANDATES.map((m) => ({ ...m }));
  history: HistoryInvoice[] = [];
  results = new Map<string, ReplayResult>();
  approvals = new Map<string, Set<string>>();
  proposals = new Map<string, MandateProposalDraft | null>();
  private seq = 0;

  private committedAll(): number {
    return this.history
      .filter((h) => h.status === 'PAID' || h.status === 'APPROVED')
      .reduce((s, h) => s + (h.usdCents ?? 0), 0);
  }

  decideBill(bill: DatasetBill, now = bill.receivedAt, requester?: Requester): Decision {
    const truth = bill.truth;
    const decision = decide({
      now: new Date(now).toISOString(),
      organization: ORGANIZATION,
      invoice: {
        extraction: truth,
        extractionError: null,
        source: bill.source,
        instructionScan: scanForAgentInstructions(
          bill.document.email?.body,
          bill.document.chat?.messages.map((m) => m.text).join('\n'),
        ),
      },
      policy: { version: 1, terms: INITIAL_POLICY },
      payees: this.payees,
      mandates: this.mandates,
      history: this.history,
      treasury: { availableUsdCents: TREASURY_BALANCE_USD_CENTS - this.committedAll() },
      requester: requester ?? { kind: 'user', userId: 'usr_laura', name: 'Laura Méndez' },
    });
    const f = decision.facts;
    this.seq++;
    this.history.push({
      invoiceId: bill.id,
      ref: `MND-${String(this.seq).padStart(4, '0')}`,
      payeeId: f.payeeId,
      issuerTaxIdNorm: f.issuerTaxIdNorm,
      issuerNameFolded: f.issuerNameFolded,
      destinationNorm: f.destinationNorm,
      invoiceNumber: f.invoiceNumber,
      invoiceNumberNorm: f.invoiceNumberNorm,
      amountMinor: f.amountMinor,
      currency: f.currency,
      usdCents: f.usdCents,
      issueDate: f.issueDate,
      servicePeriod: f.servicePeriod,
      periodKey: f.periodKey,
      status:
        decision.outcome === 'PAY'
          ? 'PAID'
          : decision.outcome === 'HOLD'
            ? 'HELD'
            : 'PENDING_APPROVAL',
      decidedAt: new Date(now).toISOString(),
    });
    this.results.set(bill.id, { bill, decision });
    return decision;
  }

  private setStatus(billId: string, status: HistoryInvoice['status']) {
    const h = this.history.find((x) => x.invoiceId === billId);
    if (!h) throw new Error(`no history for ${billId}`);
    h.status = status;
  }

  apply(action: (typeof SCRIPT)[number]) {
    const user = USERS.find((u) => u.id === action.userId)!;
    switch (action.kind) {
      case 'approve': {
        const result = this.results.get(action.bill)!;
        const set = this.approvals.get(action.bill) ?? new Set<string>();
        set.add(action.userId);
        this.approvals.set(action.bill, set);
        if (set.size >= result.decision.approvalsRequired) {
          this.setStatus(action.bill, 'APPROVED');
          this.proposals.set(
            action.bill,
            proposeFromApproval({
              decision: result.decision,
              extraction: result.bill.truth,
              policy: INITIAL_POLICY,
              payees: this.payees,
              mandates: this.mandates,
              approvers: [...set].map((id) => USERS.find((u) => u.id === id)!.name),
              approvedAt: new Date(action.at).toISOString(),
            }),
          );
        }
        break;
      }
      case 'reject':
        this.setStatus(action.bill, 'REJECTED');
        break;
      case 'accept_proposal': {
        const draft = this.proposals.get(action.bill);
        if (!draft) throw new Error(`no proposal for ${action.bill}`);
        const n = this.mandates.length + 1;
        const { payee, mandate, supersedes } = materializeProposal(draft, {
          payeeId: `pay_new_${n}`,
          mandateId: `man_new_${n}`,
          mandateKey: `man_new_${n}`,
          signer: { userId: user.id, name: user.name },
          now: new Date(action.at).toISOString(),
        });
        if (payee) this.payees.push(payee);
        this.mandates = this.mandates.map((m) =>
          m.id === supersedes ? { ...m, status: 'superseded' } : m,
        );
        this.mandates.push(mandate);
        break;
      }
      case 'reject_proposal':
        this.proposals.set(action.bill, null);
        break;
      case 'update_payee_destination':
        this.payees = this.payees.map((p) =>
          p.id === action.payeeId ? { ...p, destination: action.destination } : p,
        );
        break;
    }
  }

  /** Bills and script actions interleaved by timestamp. */
  run(bills: DatasetBill[]) {
    type Event = { at: number; bill?: DatasetBill; action?: (typeof SCRIPT)[number] };
    const events: Event[] = [
      ...bills.map((b) => ({ at: Date.parse(b.receivedAt), bill: b })),
      ...SCRIPT.map((a) => ({ at: Date.parse(a.at), action: a })),
    ].sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (e.bill) this.decideBill(e.bill);
      else if (e.action) this.apply(e.action);
    }
  }

  agentRequester(agentId: string): Requester {
    const agent = AGENTS.find((a) => a.id === agentId)!;
    return { kind: 'agent', agentId: agent.id, name: agent.name, scope: agent.scope };
  }

  destinationOf(payeeId: string): string | null {
    return normalizeDestination(this.payees.find((p) => p.id === payeeId)?.destination.value);
  }
}
