import type { BillStatus, EvidenceItem, ExtractedBill, LineMatch, Outcome } from '@recibido/domain';

export type Month = 'septiembre' | 'octubre';
export type Channel = 'pdf' | 'email' | 'chat' | 'portal';

export interface BillSpec {
  /** 'oct-03'; a corrected bill sent through the portal is 'oct-03-r1' */
  id: string;
  month: Month;
  /** relative to packages/dataset/files, e.g. 'octubre/oct-03-daniela-ospina-cuenta-de-cobro.pdf' */
  file: string;
  channel: Channel;
  /** who really sent it; null for an entity that is not a registered vendor */
  vendorId: string | null;
  /** ground-truth reading (confidence 1, except the fields a bill is designed to blur) */
  truth: ExtractedBill;
  /** ground-truth line → contract term mapping (confidence 1) */
  truthMatches: LineMatch[];
  /** e-mail body or chat transcript, verbatim (e-mail and chat channels only) */
  body?: string;
  /** portal replies that correct a bill */
  revisionOfBillId?: string;
  /**
   * first: the first decision on this bill. final: the status its case ends in at the end of the
   * script (for a superseded bill, the status of the revision that replaced it).
   */
  expected: { first: Outcome; final: BillStatus; resolvedBy: 'agent' | 'vendor' | 'person' };
  /** one Spanish sentence for the tour and the eval report */
  story: string;
}

export type ScriptStep =
  | { at: string; type: 'bill'; billId: string }
  | { at: string; type: 'vendor_reply'; billId: string; message: string; replyBillId?: string }
  | { at: string; type: 'evidence'; item: EvidenceItem; label: string }
  | {
      at: string;
      type: 'human';
      billId: string;
      action: 'approve' | 'reject';
      actor: string;
      note: string;
    }
  | { at: string; type: 'clock'; to: string; label: string };
