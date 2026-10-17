import { normalizeDestination } from './text';

/**
 * Words that put a nearby number or e-mail in payout territory. "cuenta de cobro" is the
 * Colombian name of the bill itself, not a bank account.
 */
const KEYWORDS =
  /cuenta(?!\s+de\s+cobro)|\bconta\b|banco|clabe|pix|llave|bre-b|\bach\b|routing|account|iban|chave|nequi|daviplata|consign|transfer|datos\s+para\s+el\s+pago|dados\s+para\s+pagamento|dados\s+banc[aá]rios|payment\s+details|remit\s+to/gi;
/** A payout word right before a tax-id label turns that id into a key ("Chave Pix: CNPJ ..."). */
const PAYOUT_WORD =
  /pix|chave|llave|bre-b|clabe|cuenta(?!\s+de\s+cobro)|\bconta\b|account|nequi|daviplata/i;
const TAX_LABEL = String.raw`(?:nit|c\.?\s?c|cnpj|cpf|rfc|ein|tax\s*id)\.?:?\s*(?:n[oº°]\.?\s*)?`;
const CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IBAN_PREFIX = /\b[a-z]{2}\d{2}/gi;
const ISO_DATE = /(?<![\d-])\d{4}-\d{2}-\d{2}(?![\d-])/g;
const DIGITS = /\+?\(?\d[\d ().-]*\d/g;
const NEAR = 60;
const IBAN_MAX = 34;

const blank = (s: string, re: RegExp) => s.replace(re, (m) => ' '.repeat(m.length));

/**
 * A known id printed as a tax id: behind its label ("NIT 900.456.789-4", "C.C. 1.036.645.218",
 * "CNPJ 34.567.891/0001-84"), separators allowed, and not continued by more digits (so
 * "1036645218-7" or "1036645218 77" is not that id).
 */
function printedTaxId(id: string): RegExp | null {
  const chars = normalizeDestination(id);
  if (chars.length < 6) return null;
  const body = [...chars].join(String.raw`[\s./-]?`);
  return new RegExp(String.raw`(?<![a-z0-9])${TAX_LABEL}${body}(?![a-z0-9]|[./-]\d|\s\d)`, 'gi');
}

/** Blank the known ids printed as tax ids, unless a payout word sits just before the label. */
function blankTaxIds(text: string, ids: readonly string[]): string {
  let out = text;
  for (const re of ids.map(printedTaxId)) {
    if (!re) continue;
    out = out.replace(re, (m: string, offset: number) =>
      PAYOUT_WORD.test(out.slice(Math.max(0, offset - 20), offset)) ? m : ' '.repeat(m.length),
    );
  }
  return out;
}

/** "20800000.00" → "2080000000" and "20800000": how a stated amount reads as a digit run. */
function amountDigits(amounts: readonly (string | null)[]): Set<string> {
  const out = new Set<string>();
  for (const a of amounts) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(a?.trim() ?? '');
    if (!m) continue;
    out.add(m[1]!);
    if (m[2]) out.add(m[1]! + m[2]);
  }
  return out;
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
 * e-mail-like keys, CNPJs and other digit runs (>= 8 digits) only near a banking word. Not
 * candidates: `ignoreIds` printed as tax ids (the vendor's own and the buyer's, see
 * {@link printedTaxId}) and digit runs that are one of the bill's own `amounts`.
 */
export function scanPayoutMentions(
  text: string,
  opts: { ignoreIds?: readonly string[]; amounts?: readonly (string | null)[] } = {},
): string[] {
  const keywords = [...text.matchAll(KEYWORDS)].map(
    (m) => [m.index, m.index + m[0].length] as const,
  );
  const near = (start: number, end: number) =>
    keywords.some(([ks, ke]) => ks - end <= NEAR && start - ke <= NEAR);
  const found = new Set<string>();
  let rest = text;
  const stated = amountDigits(opts.amounts ?? []);
  rest = blankTaxIds(rest, opts.ignoreIds ?? []);
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
  for (const m of rest.matchAll(CNPJ)) {
    if (near(m.index, m.index + m[0].length)) found.add(m[0].replace(/\D/g, ''));
  }
  rest = blank(rest, CNPJ);
  for (const m of rest.matchAll(DIGITS)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 8) continue;
    if (digits.length !== 18 && stated.has(digits)) continue; // a CLABE stays a CLABE
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
