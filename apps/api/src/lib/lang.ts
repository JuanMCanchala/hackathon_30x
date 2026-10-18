/**
 * English, Portuguese or Spanish for a piece: the platform's own tag first (Bluesky's `langs`),
 * then ELD's n-gram detector limited to the three, then core's word list. Lives here, not in
 * core, so core stays free of a 1.6 MB model.
 */
import { eld } from 'eld/small';
import { guessLang, type ScreenLang } from '@radar/core';

eld.setLanguageSubset(['en', 'es', 'pt']);

const LANGS = new Set<string>(['en', 'es', 'pt']);

export function langOf(piece: {
  lang?: string | null;
  title?: string | null;
  text: string;
}): ScreenLang | null {
  const given = piece.lang?.slice(0, 2);
  if (given && LANGS.has(given)) return given as ScreenLang;
  const text = [piece.title, piece.text].filter(Boolean).join('\n');
  const detected = eld.detect(text);
  if (detected.isReliable() && LANGS.has(detected.language)) return detected.language as ScreenLang;
  return guessLang(text);
}
