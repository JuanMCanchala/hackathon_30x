import { normalizeDestination } from './text';

const KEYWORDS = /cuenta|banco|clabe|pix|llave|bre-b|ach|routing|account|iban|chave/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DIGITS = /\d(?:[ -]?\d){7,}/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NEAR = 60;

/** Normalized payout candidates (account numbers, CLABEs, e-mail/phone keys) near banking words. */
export function scanPayoutMentions(text: string): string[] {
  const keywords = [...text.matchAll(KEYWORDS)].map((m) => [m.index, m.index + m[0].length] as const);
  const near = (start: number, end: number) =>
    keywords.some(([ks, ke]) => ks - end <= NEAR && start - ke <= NEAR);
  const found = new Set<string>();
  for (const re of [EMAIL, DIGITS]) {
    for (const m of text.matchAll(re)) {
      if (ISO_DATE.test(m[0]) || !near(m.index, m.index + m[0].length)) continue;
      found.add(normalizeDestination(m[0]));
    }
  }
  return [...found];
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
  /sin\s+revisi[oó]n/,
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
