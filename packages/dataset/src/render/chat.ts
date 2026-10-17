import type { BillSpec } from '../bills/types';

/** A WhatsApp "export chat" file: the transcript lines as the app writes them. */
export function buildChatExport(spec: BillSpec): string {
  if (!spec.body) throw new Error(`${spec.id}: a chat bill needs its transcript`);
  return `${spec.body}\n`;
}
