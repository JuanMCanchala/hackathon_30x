import { foldDiacritics } from './text';

export interface InstructionScan {
  matched: boolean;
  phrases: string[];
}

/**
 * Deterministic detector of text addressed to an automated system, used in addition to the
 * reader's own flag so prompt-injection detection never depends only on the model (ADR-0010).
 * Patterns cover Spanish, English and Portuguese and are matched on diacritic-folded text.
 */
const PATTERNS: RegExp[] = [
  /\bignor(a|e|ar|en|ad)\b.{0,60}\b(regla|reglas|instruccion|instrucciones|rules|instructions|politica|policy|limite|limites|regras)/,
  /\bpre-?aprobad[ao]s?\b|\bpre-?approved\b|\bpre-?aprovad[ao]s?\b/,
  /\b(sin|without|sem)\s+(revision|review|revisar|revisao|aprobacion|approval|aprovacao)\b/,
  /\b(nota|note|mensaje|message|instrucciones?|instructions?)\s+(para|to|for)\s+(el|la|the|o|a)?\s*(sistema|system|agente|agent|ia|ai|asistente|assistant|bot|modelo|model)\b/,
  /\b(aprobar|aprueba|approve|aprovar|aprove)\s+(automaticamente|automatically|de inmediato|immediately|sin|without)\b/,
  /\b(no|do not|don't|nao)\s+(escalar|escales|escalate|escalone|escalonar)\b/,
  /\b(marcar|marca|mark|marque)\s+(como|as)\s+(aprobad[ao]|pagad[ao]|approved|paid|aprovad[ao])\b/,
  /\bsystem prompt\b|\byou are now\b|\bahora eres\b|\bnew instructions\b|\bnuevas instrucciones\b/,
  /\b(procesar|procese|process|processar)\s+(sin|without|sem|de inmediato|immediately)\b/,
  /\bal (agente|sistema) de pagos\b|\bpayment (agent|bot|automation)\b/,
];

export function scanForAgentInstructions(...texts: (string | null | undefined)[]): InstructionScan {
  const phrases: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    const folded = foldDiacritics(text).toLowerCase().replace(/\s+/g, ' ');
    for (const pattern of PATTERNS) {
      const match = pattern.exec(folded);
      if (match) phrases.push(match[0]);
    }
  }
  const unique = [...new Set(phrases)];
  return { matched: unique.length > 0, phrases: unique };
}
