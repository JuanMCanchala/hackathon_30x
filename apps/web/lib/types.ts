/** The API contract, as the web reads it. Mirrors apps/api/src/services/*. */

export type Stage = 'emergente' | 'crecimiento' | 'saturado' | 'declive' | 'estable';

export const STAGE_COPY: Record<Stage, string> = {
  emergente: 'Emergente',
  crecimiento: 'En crecimiento',
  saturado: 'Saturado',
  declive: 'En declive',
  estable: 'Estable',
};

export type Platform =
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'bluesky'
  | 'hn'
  | 'github'
  | 'huggingface'
  | 'arxiv'
  | 'news'
  | 'newsletter'
  | 'producthunt';

export const PLATFORM_COPY: Record<Platform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  bluesky: 'Bluesky',
  hn: 'Hacker News',
  github: 'GitHub',
  huggingface: 'Hugging Face',
  arxiv: 'arXiv',
  news: 'Noticias',
  newsletter: 'Newsletters',
  producthunt: 'Product Hunt',
};

export type Lane = 'mainstream' | 'technical' | 'media';

/** The languages the radar follows: viral AI content usually starts in English or Portuguese. */
export type Lang = 'en' | 'pt' | 'es';
export const LANGS: readonly Lang[] = ['en', 'pt', 'es'];
export const LANG_COPY: Record<Lang, string> = { en: 'Inglés', pt: 'Portugués', es: 'Español' };
export const LANG_SHORT: Record<Lang, string> = { en: 'EN', pt: 'PT', es: 'ES' };

export interface LanguageWave {
  lang: Lang;
  creators: number;
  growthPct: number;
  stage: Stage | 'ausente';
  wavePos: number | null;
  sparkline: number[];
}

export interface SpanishWindow {
  open: boolean;
  leader: Lang | null;
  lagDays: number | null;
}

export interface RadarTopic {
  id: string;
  rank: number;
  name: string;
  definition: string | null;
  stage: Stage;
  /** "Entra ya", "Esta semana", "Solo con ángulo propio", "No entres", "Observa". */
  timing: string;
  growthPct: number;
  lift: number;
  momentum: number;
  creators: number;
  pieces: number;
  platforms: Platform[];
  /** Distinct creators per week, oldest first (8 weeks). */
  sparkline: number[];
  /** Fit with 30X's audience, 1 to 10; null until analyzed. */
  fit: number | null;
  /** One line: why it is growing. */
  why: string | null;
  /** Position on the canonical wave, 0 to 1. */
  wavePos: number;
  /** No piece from 30X or Andrés Bilbao in the last 60 days. */
  untouched: boolean;
  /** Rising in the technical lane, not yet on LinkedIn or Instagram. */
  forming: boolean;
  /** Nobody talked about it in the four weeks before: new this week. */
  fresh: boolean;
  /** Sources sampled alike where it grows by itself. */
  growingIn: Platform[];
  /** Grows in two or more of them; otherwise «por confirmar». */
  confirmed: boolean;
  languages: Record<Lang, LanguageWave>;
  spanishWindow: SpanishWindow;
}

export interface Radar {
  week: { start: string; end: string };
  headline: string;
  basis: {
    pieces: number;
    creators: number;
    sources: number;
    updatedAt: string | null;
  };
  topics: RadarTopic[];
  forming: RadarTopic[];
  /** Viral in English or Portuguese, barely started in Spanish: adapt these first. */
  windowsOpen: RadarTopic[];
  /** Growing topics left out because they do not serve 30X's audience. */
  hiddenByAudience: number;
  cost: { weekUsd: number; llmUsd: number; dataUsd: number };
}

export interface Piece {
  id: string;
  platform: Platform;
  url: string;
  authorName: string;
  authorHandle: string | null;
  authorFollowers: number | null;
  publishedAt: string;
  title: string | null;
  text: string;
  format: string;
  hookType: string | null;
  hook: string | null;
  emotion: string | null;
  audience: string | null;
  authorType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number;
  /** Engagement ÷ the author's median; null without history. */
  outlier: number | null;
  reference: boolean;
}

export interface WhyPattern {
  feature: string;
  value: string;
  /** Plain words: "abren con una cifra". */
  label: string;
  outliers: number;
  outlierTotal: number;
  rest: number;
  restTotal: number;
  lift: number;
}

export interface TopicFit {
  score: number;
  executive: number;
  noCode: number;
  latam: number;
  pillar: string;
  hypeRisk: string;
  reasons: string[];
}

export interface TopicDetail {
  topic: RadarTopic & {
    queries: string[];
    wikipedia: string | null;
    /** Whether the rank is among topics for 30X's audience (the radar's default) or all. */
    rankScope: '30x' | 'all';
  };
  weekly: { week: string; creators: number; pieces: number; byLane: Record<Lane, number> }[];
  history: {
    source: 'wikipedia' | 'hn' | 'bluesky';
    label: string;
    points: { date: string; value: number }[];
  }[];
  trigger: { date: string; title: string; url: string; source: string } | null;
  why: { patterns: WhyPattern[]; narrative: string | null; cited: string[] };
  fit: TopicFit | null;
  evidence: Piece[];
  /** What already worked in English or Portuguese, with its idea in Spanish. */
  inspiration: (Piece & { lang: 'en' | 'pt'; es: string | null })[];
  coverage: { name: string; pieces: Piece[] }[];
}

export interface Adaptation {
  id: string;
  topicId: string;
  variant: number;
  angle: string;
  hooks: string[];
  linkedin: string;
  carousel: { title: string; body: string }[];
  reel: { hook: string; beats: string[]; onScreen: string[]; cta: string };
  youtube: { title: string; thumbnail: string };
  avoid: string[];
  /** English or Portuguese pieces it builds on (absent in older adaptations). */
  inspiredBy?: string[];
  createdAt: string;
}

export interface CalendarEntry {
  id: string;
  adaptationId: string;
  topicId: string;
  topicName: string;
  format: string;
  title: string;
  body: string;
  scheduledFor: string;
  approvedBy: string;
  approvedAt: string;
}

/** What an adaptation says, without its bookkeeping: also what a caught piece turns into. */
export type AdaptationContent = Omit<Adaptation, 'id' | 'topicId' | 'variant' | 'createdAt'>;

/** «Vigía»: a followed topic. The steps of a search, in the order the rules apply. */
export type WatchStep =
  'encontradas' | 'idioma' | 'tema' | 'reciente' | 'viral' | 'nuevo' | 'presupuesto';

export interface WatchSummary {
  id: string;
  term: string;
  caught: number;
  lastRunAt: string | null;
  running: boolean;
}

export interface WatchReport {
  steps: { step: WatchStep; left: number }[];
  sources: {
    source: string;
    lang: 'en' | 'pt' | null;
    query: string;
    status: number;
    found: number;
  }[];
  rejected: { rule: WatchStep; count: number; examples: { title: string; reason: string }[] }[];
  caught: number;
  costUsd: number;
  tokens: { input: number; output: number };
}

export interface WatchHit {
  piece: Piece;
  lang: 'en' | 'pt';
  score: number;
  reasons: string[];
  foundAt: string;
  capture: {
    es: string | null;
    slides?: { n: number; image: string; text: string; es: string }[];
    video?: { hook: string; points: string[]; transcriptChars: number } | null;
    idea?: string | null;
  } | null;
  adaptation: AdaptationContent | null;
}

export interface WatchDetail {
  watch: {
    id: string;
    term: string;
    plan: Record<'en' | 'pt', { queries: string[]; match: string[] }>;
    langs: ('en' | 'pt')[];
    windowHours: number;
    everyMinutes: number;
    budget: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    running: boolean;
  };
  run: {
    startedAt: string;
    finishedAt: string | null;
    report: WatchReport | null;
    error: string | null;
  } | null;
  hits: WatchHit[];
}
