import type { BillSpec } from '../bills/types';
import { SCRIPT } from '../script';
import { buildChatExport } from './chat';
import { buildEml } from './email';
import { renderBillPdf } from './pdf';

/** When the script delivers a bill: its own arrival, or the vendor reply that carries it. */
export function arrivalOf(billId: string): string {
  for (const step of Object.values(SCRIPT).flat()) {
    if (step.type === 'bill' && step.billId === billId) return step.at;
    if (step.type === 'vendor_reply' && step.replyBillId === billId) return step.at;
  }
  throw new Error(`${billId} never arrives in the script`);
}

/** The bytes of a bill's file (PDF, .eml with the PDF attached, or WhatsApp .txt). */
export async function renderBillFile(spec: BillSpec): Promise<Uint8Array> {
  switch (spec.channel) {
    case 'pdf':
    case 'portal':
      return renderBillPdf(spec);
    case 'email':
      return Buffer.from(buildEml(spec, arrivalOf(spec.id), await renderBillPdf(spec)), 'utf8');
    case 'chat':
      return Buffer.from(buildChatExport(spec), 'utf8');
  }
}
