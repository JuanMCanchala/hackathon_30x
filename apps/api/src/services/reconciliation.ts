/**
 * The Blinka statement matched against our payments, each line linked through the whole chain:
 * bank line ↔ payment ↔ bill ↔ contract ↔ evidence.
 */
import { eq } from 'drizzle-orm';
import {
  reconcile,
  STATUS_LABEL,
  type BankLine,
  type EvidenceItem,
  type MatchStatus,
} from '@recibido/domain';
import { bankLines, bills } from '../db/schema';
import { allContracts, allPayments, allVendors, lastDecision, ORG_ID, type Deps } from './state';
import { publicPayment, type PublicPayment } from './views';

export interface ReconciliationRow {
  line: BankLine;
  status: MatchStatus;
  fxDiffUsdMinor: number;
  note: string;
  payment: PublicPayment | null;
  bill: {
    id: string;
    datasetId: string | null;
    status: string;
    statusLabel: string;
    invoiceNumber: string | null;
    total: string | null;
    currency: string | null;
  } | null;
  contract: { id: string; title: string; type: string; evidenceRuleText: string } | null;
  evidence: EvidenceItem[];
}

export async function reconciliationView(deps: Deps) {
  const { db } = deps;
  const payments = await allPayments(db);
  const lines = (await db.select().from(bankLines).where(eq(bankLines.orgId, ORG_ID)))
    .map((r) => r.data)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const { matches, unmatchedPayments } = reconcile(payments, lines);
  const vendors = await allVendors(db);
  const contracts = await allContracts(db);
  const billRows = await db.select().from(bills).where(eq(bills.orgId, ORG_ID));

  const rows: ReconciliationRow[] = [];
  for (const m of matches) {
    const line = lines.find((l) => l.id === m.lineId)!;
    const payment = payments.find((p) => p.id === m.paymentId) ?? null;
    const bill = payment ? billRows.find((b) => b.id === payment.billId) : undefined;
    const contract = contracts.find((c) => c.id === payment?.contractId);
    const decision = bill ? await lastDecision(db, bill.id) : null;
    const evidence = new Map<string, EvidenceItem>();
    for (const l of decision?.lines ?? [])
      for (const e of [...l.evidence, ...l.supporting]) evidence.set(e.id, e);
    rows.push({
      line,
      status: m.status,
      fxDiffUsdMinor: m.fxDiffUsdMinor,
      note: m.note,
      payment: payment ? publicPayment(payment, vendors) : null,
      bill: bill
        ? {
            id: bill.id,
            datasetId: bill.datasetId,
            status: bill.status,
            statusLabel: STATUS_LABEL[bill.status],
            invoiceNumber: bill.reading?.invoiceNumber ?? null,
            total: bill.reading?.total ?? null,
            currency: bill.reading?.currency ?? null,
          }
        : null,
      contract: contract
        ? {
            id: contract.id,
            title: contract.title,
            type: contract.type,
            evidenceRuleText: contract.evidenceRuleText,
          }
        : null,
      evidence: [...evidence.values()],
    });
  }

  const count = (s: MatchStatus) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    unmatchedPayments: payments
      .filter((p) => unmatchedPayments.includes(p.id))
      .map((p) => publicPayment(p, vendors)),
    totals: {
      lines: rows.length,
      matched: count('matched'),
      matchedFx: count('matched_fx'),
      fees: count('fee'),
      returned: count('returned'),
      unmatched: count('unmatched'),
      fxDiffUsdMinor: rows.reduce((s, r) => s + r.fxDiffUsdMinor, 0),
      debitsUsdMinor: lines
        .filter((l) => l.amountUsdMinor < 0)
        .reduce((s, l) => s - l.amountUsdMinor, 0),
    },
  };
}
