/**
 * The screen before any model reads a piece. Rules, not tokens, decide what a followed topic
 * catches: the language, whether it is about the topic, how recent it is, whether it is viral and
 * whether we already had it. Each decision keeps its reason in words, and only the pieces that
 * pass, up to a budget per search, go on to be read, translated and transcribed. The rules sit
 * behind one function, so a decision engine (such as JEV) can take their place.
 */
import type { Platform } from './types';
import { percentile } from './stats';

export type ScreenLang = 'en' | 'pt' | 'es' | 'hi';

export const SCREEN_LANG_COPY: Record<ScreenLang, string> = {
  en: 'inglés',
  pt: 'portugués',
  es: 'español',
  hi: 'hindi',
};

/** In the order they apply: a piece stops at the first one it fails. */
export const SCREEN_RULES = [
  'idioma',
  'tema',
  'reciente',
  'viral',
  'nuevo',
  'presupuesto',
] as const;
export type ScreenRule = (typeof SCREEN_RULES)[number];

export interface ScreenCandidate {
  /** `<platform>:<externalId>`. */
  key: string;
  platform: Platform;
  /** The language, from the platform or `guessLang`; null when unknown. */
  lang: ScreenLang | null;
  /** Title, caption or body: what the topic terms are matched against. */
  text: string;
  publishedAt: string;
  /** False when the platform did not say when it was published: it cannot count as recent. */
  dateKnown?: boolean;
  /** `engagementOf` the latest metrics. */
  engagement: number;
  /** The median engagement of the author's other pieces, when there are at least three. */
  authorMedian: number | null;
}

export interface ScreenOptions {
  now: string;
  /** The languages to catch, usually the ones where viral content starts: English, Portuguese. */
  langs: readonly ScreenLang[];
  /** Words that mean the topic in each language, e.g. { en: ['business'], pt: ['negócios'] }. */
  match: Partial<Record<ScreenLang, readonly string[]>>;
  windowHours: number;
  /** How many pieces per search may spend tokens. */
  budget: number;
  /** Keys already caught for this topic in earlier searches. */
  seen: ReadonlySet<string>;
  /**
   * What a decision engine (JEV) said about some pieces, computed before the screen so it stays
   * pure. A judged piece is about the topic when `onTopic` reaches `JEV_ON_TOPIC`; the rest fall
   * back to the keywords.
   */
  judged?: ReadonlyMap<string, ScreenVerdict>;
}

export interface ScreenVerdict {
  /** Probability that the piece is about the topic, 0..1. */
  onTopic: number;
  /** Fit with 30X's audience, 1..10. */
  fit: number;
}

/** A judged piece is about the topic from this probability on (0.57 let a false positive through). */
export const JEV_ON_TOPIC = 0.6;

export interface ScreenDecision {
  key: string;
  pass: boolean;
  /** The rule that stopped it, or null when it passed them all. */
  failed: ScreenRule | null;
  /** Why it passed (what made it viral) or why it stopped, in words. */
  reasons: string[];
  /** Ranks the pieces that pass: speed within its platform, its author's median and freshness. */
  score: number;
  ageHours: number;
  /** Engagement per hour since it was published. */
  velocity: number;
  /** Engagement ÷ the author's median; null without history. */
  ratio: number | null;
  /** The topic term it mentions. */
  matched: string | null;
  /** Fit with 30X's audience (1..10) when JEV judged the piece. */
  fit: number | null;
}

export interface ScreenResult {
  decisions: ScreenDecision[];
  /** How many were still in after each rule, starting from everything found. */
  funnel: { step: 'encontradas' | ScreenRule; left: number }[];
  /** The ones that passed, best first. */
  caught: ScreenDecision[];
}

/** Pieces of one platform needed to compare speeds; fewer and the rule falls back to the author. */
export const MIN_PEERS = 4;
/** Engagement at least this many times the author's median is viral by itself. */
export const VIRAL_RATIO = 2;
/** Or being among the fastest quarter of the platform in the same search. */
export const VIRAL_PERCENTILE = 75;

const PLATFORM_NAME: Partial<Record<Platform, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  x: 'X',
  bluesky: 'Bluesky',
  hn: 'Hacker News',
};

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first term the text mentions as a whole word or phrase, ignoring case and accents. */
export function mentions(text: string, terms: readonly string[]): string | null {
  const folded = fold(text);
  for (const term of terms) {
    const t = fold(term).trim();
    if (!t) continue;
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}($|[^\\p{L}\\p{N}])`, 'u').test(folded))
      return term;
  }
  return null;
}

const WORDS: Record<Exclude<ScreenLang, 'hi'>, ReadonlySet<string>> = {
  en: new Set(
    'the and of to is are for with that this you your how what it on be will from they we have has why about can'.split(
      ' ',
    ),
  ),
  pt: new Set(
    'não você com uma um em os do da dos das são isso mais também seu sua pra ao aos às é nós eles muito quando ou têm'.split(
      ' ',
    ),
  ),
  es: new Set(
    'el los las del y con una un por más cómo pero también es su sus al lo le les muy cuando sin ya tienen'.split(
      ' ',
    ),
  ),
};

/**
 * English, Portuguese or Spanish from the words a text uses, without a model: function words that
 * only one of the three has, plus spelling cues (ção / ción, ñ, ã, ê). Null when it cannot tell.
 */
export function guessLang(text: string): ScreenLang | null {
  // Hindi is written in Devanagari: its script says it before any word list.
  const devanagari = text.match(/[\u0900-\u097f]/g)?.length ?? 0;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (devanagari >= 6 && devanagari >= letters * 0.3) return 'hi';
  const lower = text.toLowerCase();
  const tokens = lower.match(/\p{L}+/gu) ?? [];
  const score: Record<Exclude<ScreenLang, 'hi'>, number> = { en: 0, pt: 0, es: 0 };
  for (const token of tokens)
    for (const lang of ['en', 'pt', 'es'] as const) if (WORDS[lang].has(token)) score[lang] += 1;
  score.pt += 2 * (lower.match(/ção|ções|[ãõçêâô]/g)?.length ?? 0);
  score.es += 2 * (lower.match(/ción|ciones|ñ|¿|¡/g)?.length ?? 0);
  const ranked = (Object.entries(score) as [ScreenLang, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best![1] < 2 || best![1] < second![1] * 1.5) return null;
  return best![0];
}

const fmtNum = (n: number, digits = 1) =>
  n.toLocaleString('es-CO', { maximumFractionDigits: digits });

/** «9 h», «3 días». */
export function fmtAge(hours: number): string {
  if (hours < 1) return 'menos de una hora';
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} días`;
}

/** Applies the rules in order. Pure: same candidates and options, same decisions. */
export function screen(candidates: readonly ScreenCandidate[], opts: ScreenOptions): ScreenResult {
  const now = new Date(opts.now).getTime();
  const decisions = new Map<string, ScreenDecision>();
  const funnel: ScreenResult['funnel'] = [{ step: 'encontradas', left: candidates.length }];

  const base = candidates.map((c) => {
    const ageHours = Math.max(0, (now - new Date(c.publishedAt).getTime()) / 3_600_000);
    const velocity = c.engagement / Math.max(1, ageHours);
    const ratio = c.authorMedian && c.authorMedian > 0 ? c.engagement / c.authorMedian : null;
    const d: ScreenDecision = {
      key: c.key,
      pass: false,
      failed: null,
      reasons: [],
      score: 0,
      ageHours,
      velocity,
      ratio,
      matched: null,
      fit: null,
    };
    decisions.set(c.key, d);
    return { c, d };
  });

  let alive = base;
  const stop = (rule: ScreenRule, keep: (x: (typeof base)[number]) => string | null) => {
    alive = alive.filter((x) => {
      const why = keep(x);
      if (why === null) return true;
      x.d.failed = rule;
      x.d.reasons = [why];
      return false;
    });
    funnel.push({ step: rule, left: alive.length });
  };

  stop('idioma', ({ c }) =>
    c.lang && opts.langs.includes(c.lang)
      ? null
      : c.lang
        ? `Está en ${SCREEN_LANG_COPY[c.lang]}.`
        : 'No se pudo saber en qué idioma está.',
  );

  stop('tema', ({ c, d }) => {
    const verdict = opts.judged?.get(c.key);
    if (verdict) {
      const pct = `${Math.round(verdict.onTopic * 100)} %`;
      if (verdict.onTopic < JEV_ON_TOPIC) return `JEV: solo lo menciona de paso (${pct}).`;
      d.fit = verdict.fit;
      d.reasons.push(`JEV: es del tema (${pct}).`);
      return null;
    }
    const terms = opts.match[c.lang!] ?? [];
    d.matched = mentions(c.text, terms);
    if (d.matched) {
      d.reasons.push(`Menciona «${d.matched}».`);
      return null;
    }
    return `No menciona ${terms
      .slice(0, 3)
      .map((t) => `«${t}»`)
      .join(' ni ')}.`;
  });

  stop('reciente', ({ c, d }) => {
    if (c.dateKnown === false) return 'No se sabe cuándo se publicó.';
    if (d.ageHours <= opts.windowHours) {
      d.reasons.push(`Publicada hace ${fmtAge(d.ageHours)}.`);
      return null;
    }
    return `Tiene ${fmtAge(d.ageHours)}; se buscan las de las últimas ${opts.windowHours} h.`;
  });

  // Speeds compare only within a platform: a YouTube view and a Bluesky like are not the same.
  const peers = new Map<Platform, number[]>();
  for (const { c, d } of alive)
    peers.set(c.platform, [...(peers.get(c.platform) ?? []), d.velocity]);
  stop('viral', ({ c, d }) => {
    const name = PLATFORM_NAME[c.platform] ?? c.platform;
    const group = peers.get(c.platform) ?? [];
    const cut = percentile(group, VIRAL_PERCENTILE);
    const rank = group.filter((v) => v <= d.velocity).length / Math.max(1, group.length);
    d.score = rank + Math.min(d.ratio ?? 0, 10) / 5 + (1 - d.ageHours / opts.windowHours) * 0.3;
    if (d.fit !== null) d.score += (d.fit - 5) / 10;
    if (c.engagement <= 0)
      return `Sin interacciones públicas en ${name}: no se puede saber si es viral.`;
    if (d.ratio !== null && d.ratio >= VIRAL_RATIO) {
      d.reasons.push(`${fmtNum(d.ratio)}× la mediana de su autor.`);
      return null;
    }
    if (group.length >= MIN_PEERS && d.velocity >= cut) {
      d.reasons.push(`Entre el 25 % más rápido de ${name} en esta búsqueda.`);
      return null;
    }
    if (group.length < MIN_PEERS && d.ratio === null) {
      d.reasons.push(`Pocas piezas de ${name} para comparar; pasa por tener interacción.`);
      return null;
    }
    return d.ratio !== null
      ? `Va en ${fmtNum(d.ratio)}× la mediana de su autor; hace falta ${VIRAL_RATIO}×.`
      : `No está entre el 25 % más rápido de ${name} en esta búsqueda.`;
  });

  stop('nuevo', ({ c }) =>
    opts.seen.has(c.key) ? 'Ya la atrapamos en una búsqueda anterior.' : null,
  );

  const ranked = [...alive].sort((a, b) => b.d.score - a.d.score);
  const within = new Set(ranked.slice(0, Math.max(0, opts.budget)).map((x) => x.c.key));
  stop('presupuesto', ({ c }) =>
    within.has(c.key)
      ? null
      : `Fuera del presupuesto de ${opts.budget} por búsqueda; vuelve a competir en la próxima.`,
  );

  for (const { d } of alive) {
    d.pass = true;
    if (d.fit !== null) d.reasons.push(`Encaje con 30X: ${d.fit}/10 (JEV).`);
  }
  return {
    decisions: [...decisions.values()],
    funnel,
    caught: alive.map((x) => x.d).sort((a, b) => b.score - a.score),
  };
}
