import { normalizeDestination } from './text';

/** "cuenta de cobro" is the Colombian name of the bill itself, not a bank account. */
const KEYWORDS =
  /cuenta(?!\s+de\s+cobro)|banco|clabe|pix|llave|bre-b|\bach\b|routing|account|iban|chave/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IBAN_PREFIX = /\b[a-z]{2}\d{2}/gi;
const ISO_DATE = /(?<![\d-])\d{4}-\d{2}-\d{2}(?![\d-])/g;
const DIGITS = /\+?\(?\d[\d ().-]*\d/g;
const NEAR = 60;
const IBAN_MAX = 34;

const blank = (s: string, re: RegExp) => s.replace(re, (m) => ' '.repeat(m.length));

/** A currency marker right before a digit run, or a currency code right after it. */
const CURRENCY_BEFORE = /(?:\$|\b(?:COP|MXN|BRL|USD))\s*$/i;
const CURRENCY_AFTER = /^\s*(?:COP|MXN|BRL|USD)\b/i;
/** "20.800.000", "12345678" or "12345678.50": an amount, not "412-873345-09" */
const AMOUNT_SHAPE = /^(?:\d{1,3}(?:\.\d{3})+|\d+(?:\.\d{1,2})?)$/;

/**
 * An id as printed ("1.036.645.218", "34.567.891/0001-84"): its characters with optional
 * separators between them, not glued to more digits (so "1036645218-7" is not that id).
 */
function printedId(id: string): RegExp | null {
  const chars = normalizeDestination(id);
  if (chars.length < 6) return null;
  return new RegExp(
    `(?<![a-z0-9]|\\d[./-])${[...chars].join('[\\s./-]?')}(?![a-z0-9]|[./-]\\d)`,
    'gi',
  );
}

/**
 * IBAN-like strings: 2 letters + 2 digits, then space-separated groups of up to 4 alphanumerics
 * (or one compact token). Every group needs a digit, except a short first one (e.g. "NWBK"), so
 * trailing prose is never swallowed. Capped at 34 characters.
 */
function findIbans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let from = 0;
  for (const p of text.matchAll(IBAN_PREFIX)) {
    if (p.index < from) continue;
    let end = p.index + 4;
    let length = 4;
    const group = / ?([a-z0-9]+)(?![a-z0-9])/iy;
    for (let first = true; ; first = false) {
      group.lastIndex = end;
      const g = group.exec(text);
      if (!g) break;
      const token = g[1]!;
      const hasDigit = /\d/.test(token);
      if (!(hasDigit || (first && token.length <= 4))) break;
      if (!first && token.length > 4) break;
      if (length + token.length > IBAN_MAX) break;
      length += token.length;
      end = group.lastIndex;
    }
    if (length >= 14) {
      out.push({ start: p.index, end });
      from = end;
    }
  }
  return out;
}

/**
 * Normalized payout candidates. UUIDs, IBAN-like strings and 18-digit runs (CLABE) always count;
 * e-mail-like keys and other digit runs (>= 8 digits) only near a banking word. Amounts written
 * with a currency marker are not candidates, nor are the `ignore` ids (tax ids printed on the
 * bill: the vendor's own and the buyer's) wherever they appear.
 */
export function scanPayoutMentions(text: string, ignore: readonly string[] = []): string[] {
  const keywords = [...text.matchAll(KEYWORDS)].map(
    (m) => [m.index, m.index + m[0].length] as const,
  );
  const near = (start: number, end: number) =>
    keywords.some(([ks, ke]) => ks - end <= NEAR && start - ke <= NEAR);
  const found = new Set<string>();
  let rest = text;
  for (const re of ignore.map(printedId)) if (re) rest = blank(rest, re);
  for (const m of rest.matchAll(UUID)) found.add(normalizeDestination(m[0]));
  rest = blank(rest, UUID);
  for (const { start, end } of findIbans(rest)) {
    found.add(normalizeDestination(rest.slice(start, end)));
    rest = rest.slice(0, start) + ' '.repeat(end - start) + rest.slice(end);
  }
  for (const m of rest.matchAll(EMAIL)) {
    if (near(m.index, m.index + m[0].length)) found.add(normalizeDestination(m[0]));
  }
  rest = blank(blank(rest, EMAIL), ISO_DATE);
  for (const m of rest.matchAll(DIGITS)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 8) continue;
    const end = m.index + m[0].length;
    const amount =
      digits.length !== 18 && // a CLABE stays a CLABE whatever precedes it
      AMOUNT_SHAPE.test(m[0]) &&
      (CURRENCY_BEFORE.test(rest.slice(Math.max(0, m.index - 6), m.index)) ||
        CURRENCY_AFTER.test(rest.slice(end, end + 6)));
    if (amount) continue;
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
