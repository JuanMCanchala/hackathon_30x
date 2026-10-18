/**
 * How long AI ideas take to reach Spanish, measured on Wikipedia: when the Spanish article on a
 * wave was created after the English one, and how many days the Spanish pageview peak trails
 * the English one. Recorded by packages/sources/scripts/fetch-language-lag.ts.
 */
import { median } from './stats';

export interface LagArticle {
  title: string;
  /** First revision, ISO 8601. */
  created: string;
  /** Busiest day of views around the wave, if the article had any. */
  peak: { date: string; views: number } | null;
}

export interface LagWave {
  id: string;
  name: string;
  event: string;
  /**
   * The English article is the wave's own (GPT-5, Vibe coding), not an older parent it
   * redirects to (Claude Code → Claude): only then does its creation date mean anything.
   */
  specific: boolean;
  en: LagArticle;
  es: LagArticle | null;
}

export interface LanguageLagFile {
  fetchedAt: string | null;
  waves: LagWave[];
}

const DAY = 86_400_000;
/** Calendar days between two dates (UTC), whatever the hour. */
const days = (from: string, to: string) =>
  Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

export function languageLag(file: LanguageLagFile) {
  const waves = file.waves.map((w) => ({
    id: w.id,
    name: w.name,
    inSpanish: w.es !== null,
    createdLagDays: w.specific && w.es ? days(w.en.created, w.es.created) : null,
    peakLagDays: w.en.peak && w.es?.peak ? days(w.en.peak.date, w.es.peak.date) : null,
  }));
  const created = waves.flatMap((w) => (w.createdLagDays === null ? [] : [w.createdLagDays]));
  const peak = waves.flatMap((w) => (w.peakLagDays === null ? [] : [w.peakLagDays]));
  return {
    fetchedAt: file.fetchedAt,
    waves,
    medianCreatedLagDays: created.length ? median(created) : null,
    medianPeakLagDays: peak.length ? median(peak) : null,
    counted: {
      created: created.length,
      peak: peak.length,
      waves: waves.length,
      notInSpanish: waves.filter((w) => !w.inSpanish).length,
    },
  };
}

export type LanguageLag = ReturnType<typeof languageLag>;
