/**
 * Text normalization used to compare identifiers. Comparisons always happen within one payee or
 * one registry, so normalizations favour catching re-formatted duplicates over strictness.
 */

const INVOICE_NOISE_TOKENS = new Set([
  'FACTURA',
  'FACT',
  'INVOICE',
  'INV',
  'FATURA',
  'CUENTA',
  'DE',
  'COBRO',
  'NO',
  'NRO',
  'NUM',
  'NUMERO',
  'N',
  'NUMBER',
]);

/**
 * "F-2026-0915", "f 2026 915", "F0915", "Factura No. 0915"… → comparable key.
 * The value is split into letter and digit runs; filler words are dropped and leading zeros of
 * each digit run removed, so any two numbers with the same alphanumeric sequence compare equal.
 */
export function normalizeInvoiceNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const runs =
    foldDiacritics(value)
      .toUpperCase()
      .match(/[A-Z]+|\d+/g) ?? [];
  const key = runs
    .filter((run) => !INVOICE_NOISE_TOKENS.has(run))
    .map((run) => (/^\d+$/.test(run) ? run.replace(/^0+(?=\d)/, '') : run))
    .join('');
  return key.length > 0 ? key : null;
}

/** Document-type labels written before tax IDs: "NIT 901…", "C.C. 1.020…", "RFC: HEGM…". */
const TAX_ID_LABEL =
  /^(?:NIT|RFC|CUIT|CUIL|CPF|CNPJ|EIN|RUC|DNI|CC|C\.C\.|CE|TIN|TAX ID|VAT|ID)(?=[\s.:#-]|\d)[\s.:#-]*/;

/** NIT "901.234.567-8", "RFC HEGM-900101-AB1", "C.C. 1.020.304.050" → upper-case alphanumerics. */
export function normalizeTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  let folded = foldDiacritics(value).toUpperCase().trim();
  const label = TAX_ID_LABEL.exec(folded);
  if (label && folded.length - label[0].length >= 6) folded = folded.slice(label[0].length);
  const key = folded.replace(/[^A-Z0-9]/g, '');
  return key.length > 0 ? key : null;
}

/** Bre-B keys, CLABEs, Pix keys, account numbers → comparable key. */
export function normalizeDestination(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-./()]/g, '');
  return key.length > 0 ? key : null;
}

/**
 * Whether the payout details written on a bill point to a registered destination.
 *
 * Alphanumeric keys (Bre-B aliases, Pix e-mails) must match exactly after normalization. Purely
 * numeric registered values (CLABE, account numbers, card endings) also match when the bill
 * contains that exact digit run among labels ("CLABE: 012 180…", "Visa •••• 4421"). This is a
 * consistency check only: Mandato always pays the registered destination, never one read
 * from a bill (SECURITY.md, T3).
 */
export function destinationsMatch(
  invoiceValue: string | null | undefined,
  registeredValue: string | null | undefined,
): boolean {
  const invoice = normalizeDestination(invoiceValue);
  const registered = normalizeDestination(registeredValue);
  if (!invoice || !registered) return false;
  if (invoice === registered) return true;
  if (/^\d{4,}$/.test(registered)) {
    const runs: string[] = (invoiceValue ?? '').replace(/[\s.\-/]/g, '').match(/\d+/g) ?? [];
    return runs.includes(registered);
  }
  return false;
}

export function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '');
}

/** Characters from other scripts that look like Latin letters (a common impersonation trick). */
const CONFUSABLES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ɡ: 'g',
  һ: 'h',
  ӏ: 'l',
  ο: 'o',
  α: 'a',
  ν: 'v',
  ρ: 'p',
  τ: 't',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Χ: 'X',
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
};

export function hasConfusableCharacters(value: string): boolean {
  return [...value].some((ch) => ch in CONFUSABLES);
}

/** Lower-case, Latin-folded, diacritic-free, single-spaced. Used only to *suggest* matches. */
export function foldName(value: string): string {
  const latin = [...value].map((ch) => CONFUSABLES[ch] ?? ch).join('');
  return foldDiacritics(latin)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(s ?a ?s|s ?a|ltda|llc|inc|corp|de c ?v|s de r ?l|sa de cv)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaro–Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function nameSimilarity(a: string, b: string): number {
  return jaroWinkler(foldName(a), foldName(b));
}

/**
 * Shortens a payout destination for receipts and agents. Bre-B aliases and Pix e-mail keys are
 * meant to be shared, and a person must see exactly how a new key differs from the registered
 * one, so they stay whole. Account numbers (CLABE, ACH, CCI) keep only their last four digits.
 */
export function maskDestination(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@') || /[a-z]/i.test(trimmed.replace(/^card\s*/i, ''))) return trimmed;
  const compact = trimmed.replace(/[\s.\-/]+/g, '');
  if (compact.length <= 6) return compact;
  return `•••${compact.slice(-4)}`;
}
