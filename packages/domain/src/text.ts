/** A leading document label ("NIT", "C.C.", "RFC", "Tax ID:", "No."...); never followed by a letter, so RFC "CEVJ..." keeps its own letters. */
const TAX_ID_LABEL =
  /^\s*(?:NIT|C\.?\s?C|C\.?\s?E|CNPJ|CPF|RFC|EIN|TAX\s?ID|TIN)\.?(?![A-Z])[\s:.]*(?:N[Oº°]\.?(?![A-Z])[\s:.]*)?/;

/** Uppercase letters and digits only, after dropping a leading label ("C.C. 1.036.645.218" → "1036645218"). */
export function normalizeTaxId(s: string): string {
  return s
    .toUpperCase()
    .replace(TAX_ID_LABEL, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Uppercase alphanumerics; leading zeros of each numeric run are dropped ("DO-2026-010" → "DO202610"). */
export function normalizeInvoiceNumber(s: string): string {
  return s
    .toUpperCase()
    .replace(/\d+/g, (run) => run.replace(/^0+(?=\d)/, ''))
    .replace(/[^A-Z0-9]/g, '');
}

/** Lowercase letters and digits only (account numbers, Pix/Bre-B keys, e-mails). */
export function normalizeDestination(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "92.5" → 5550. Null when not a plain number with at most 2 decimals. */
export function parseHoursToMinutes(q: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(q.trim());
  if (!m) return null;
  const hundredths = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  const minutes = Math.round((hundredths * 60) / 100);
  return Number.isSafeInteger(minutes) ? minutes : null;
}
