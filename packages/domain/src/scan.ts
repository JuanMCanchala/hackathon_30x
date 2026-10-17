import { normalizeDestination } from './text';

const KEYWORDS = /cuenta|banco|clabe|pix|llave|bre-b|\bach\b|routing|account|iban|chave/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IBAN = /\b[a-z]{2}\d{2}(?: ?[a-z0-9]){10,}\b/gi;
const DIGITS = /\+?\(?\d[\d ().-]*\d/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NEAR = 60;

const blank = (s: string, re: RegExp) => s.replace(re, (m) => ' '.repeat(m.length));

/**
 * Normalized payout candidates. UUIDs, IBAN-like strings and 18-digit runs (CLABE) always count;
 * e-mail-like keys and other digit runs (>= 8 digits) only near a banking word.
 */
export function scanPayoutMentions(text: string): string[] {
  const keywords = [...text.matchAll(KEYWORDS)].map((m) => [m.index, m.index + m[0].length] as const);
  const near = (start: number, end: number) =>
    keywords.some(([ks, ke]) => ks - end <= NEAR && start - ke <= NEAR);
  const found = new Set<string>();
  let rest = text;
  for (const re of [UUID, IBAN]) {
    for (const m of rest.matchAll(re)) found.add(normalizeDestination(m[0]));
    rest = blank(rest, re);
  }
  for (const m of rest.matchAll(EMAIL)) {
    if (near(m.index, m.index + m[0].length)) found.add(normalizeDestination(m[0]));
  }
  rest = blank(rest, EMAIL);
  for (const m of rest.matchAll(DIGITS)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 8 || ISO_DATE.test(m[0].trim())) continue;
    if (digits.length === 18 || near(m.index, m.index + m[0].length)) found.add(digits);
  }
  return [...found];
}

/** Same destination, tolerating a phone key written with or without country code. */
export function sameDestination(candidate: string, registered: string): boolean {
  const a = normalizeDestination(candidate);
  const b = normalizeDestination(registered);
  if (a === b) return true;
  return a.length >= 8 && b.length >= 8 && (a.endsWith(b) || b.endsWith(a));
}

const PAYOUT_CHANGE = [
  /nuev[ao]s?\s+(cuenta|datos\s+bancarios|llave|clabe)/,
  /cambi(amos|o|ar|ó)\s+(de|a)\s+(banco|cuenta)/,
  /cambio\s+de\s+(cuenta|banco|datos\s+bancarios|llave)/,
  /actualic\w+\s+(los\s+)?datos\s+(bancarios|de\s+pago)/,
  /nov[ao]s?\s+(conta|chave)/,
  /mudamos\s+de\s+(banco|conta)/,
  /(new|changed?|updated?)\s+(bank\s+)?(account|banking\s+details|payment\s+details|routing)/,
  /(update|change)\s+(our|my|the)\s+(bank|payment|banking)/,
];

export function mentionsPayoutChange(text: string): boolean {
  const t = text.toLowerCase();
  return PAYOUT_CHANGE.some((re) => re.test(t));
}

const INSTRUCTIONS = [
  /ignor[ae]\s+(las\s+|todas\s+las\s+)?instrucciones/,
  /ignore\s+(all\s+)?(previous|prior|above)/,
  /ignor[ea]\s+(as\s+)?instru[cç][õo]es/,
  /aprueb[ae]\s+(este|el)\s+pago/,
  /approve\s+(this|the)\s+(payment|invoice|bill)/,
  /aprove\s+(este|o)\s+pagamento/,
  /\bsystem\s*:/,
  /\bsistema\s+autom[aá]tico/,
  /as\s+an\s+ai\b/,
  /\b(you\s+are|eres)\s+(an?\s+)?(ai|assistant|asistente)\b/,
];

/** True when the text addresses an automated system rather than a person. */
export function scanInstructions(text: string): boolean {
  const t = text.toLowerCase();
  return INSTRUCTIONS.some((re) => re.test(t));
}
