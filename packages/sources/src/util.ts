/**
 * Small text helpers shared by the parsers: counts written for people ("1,2 M de vistas"),
 * relative dates ("hace 3 días"), durations ("1:02:03") and HTML fragments.
 */

const MULTIPLIERS: [RegExp, number][] = [
  [/\bmil\s+millones\b|\bmm\b|\bb\b|\bbn\b|billion/, 1e9],
  [/\bmill[oó]n(es)?\b|\bmills?\b|\bm\b|\bmln\b|million/, 1e6],
  [/\bmil\b|\bk\b|thousand/, 1e3],
];

/**
 * A count as a platform writes it: "108,995 vistas", "2.3 mil vistas", "1,2 M de vistas",
 * "82K views", "14.601 seguidores", "No views". Returns undefined when there is no number.
 */
export function parseCount(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const t = text
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .trim();
  if (/^(no|sin)\b/.test(t)) return 0;
  const match = t.match(/(\d[\d.,\s]*)\s*([a-zñ]+(?:\s+[a-zñ]+)?)?/);
  if (!match) return undefined;
  const digits = match[1]!.trim();
  const suffix = ` ${match[2] ?? ''} `;
  const multiplier = MULTIPLIERS.find(([re]) => re.test(suffix))?.[1];
  if (multiplier) {
    // With a multiplier the separator is a decimal point: "1,2 M" and "2.3 mil" are 1.2 and 2.3.
    const value = Number.parseFloat(digits.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(value) ? Math.round(value * multiplier) : undefined;
  }
  // Without one, every separator groups thousands: "108,995", "14.601", "1 234".
  const value = Number.parseInt(digits.replace(/[.,\s]/g, ''), 10);
  return Number.isFinite(value) ? value : undefined;
}

const UNIT_MS: [RegExp, number][] = [
  [/^(s|seg|segundos?|seconds?|secs?)$/, 1_000],
  [/^(m|min|mins|minutos?|minutes?)$/, 60_000],
  [/^(h|hr|hrs|horas?|hours?)$/, 3_600_000],
  [/^(d|d[ií]as?|days?)$/, 86_400_000],
  [/^(w|sem|semanas?|weeks?)$/, 7 * 86_400_000],
  [/^(mo|mes|meses|months?)$/, 30 * 86_400_000],
  [/^(y|yr|yrs|a[nñ]os?|years?)$/, 365 * 86_400_000],
];

/**
 * A relative date in Spanish or English, measured back from `now`: "hace 1 día", "hace 21 h",
 * "Transmitido hace 4 días", "4d ago", "2 weeks ago", "Streamed 3 hours ago".
 * Returns an ISO string, or undefined when the text has no recognisable amount and unit.
 */
export function parseRelativeTime(
  text: string | undefined | null,
  now: string,
): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(/\u00a0/g, ' ');
  const match = t.match(/(\d+)\s*([a-zñáéíóú]+)/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = UNIT_MS.find(([re]) => re.test(match[2]!))?.[1];
  if (!unit) return undefined;
  return new Date(Date.parse(now) - amount * unit).toISOString();
}

/** "9:24" → 564, "1:11:21" → 4281. */
export function parseDuration(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const parts = text.trim().split(':').map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return undefined;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Plain text from an HTML fragment: tags out, entities decoded, whitespace collapsed. */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** ISO from seconds or milliseconds since the epoch, or from a date string; undefined if invalid. */
export function toIso(value: number | string | undefined | null): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  let ms: number;
  if (typeof value === 'number') ms = value < 1e12 ? value * 1000 : value;
  else ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** "es-419" → "es", "en-US" → "en". */
export function langOf(code: string | undefined | null): string | undefined {
  const lang = code?.trim().toLowerCase().split(/[-_]/)[0];
  return lang && /^[a-z]{2}$/.test(lang) ? lang : undefined;
}

/** The JSON assigned to a variable inside a <script>: `var ytInitialData = {...};`. */
export function extractAssignedJson(html: string, name: string): unknown {
  const marker = html.indexOf(name);
  if (marker < 0) return undefined;
  const start = html.indexOf('{', marker);
  if (start < 0) return undefined;
  const end = matchingBrace(html, start);
  if (end < 0) return undefined;
  try {
    return JSON.parse(html.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** The JSON body of `<script id="..." ...>…</script>` or `<script type="...">` by attribute match. */
export function extractScriptJson(html: string, attribute: RegExp): unknown[] {
  const found: unknown[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (!attribute.test(m[1]!)) continue;
    try {
      found.push(JSON.parse(m[2]!.trim()));
    } catch {
      // A malformed block is skipped; the others still count.
    }
  }
  return found;
}

/** Index of the brace that closes the one at `start`, aware of strings and escapes. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Depth-first search for every value stored under `key`, anywhere in a JSON tree. */
export function findAll(tree: unknown, key: string): unknown[] {
  const out: unknown[] = [];
  const stack: unknown[] = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
    } else if (node && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [k, v] = entries[i]!;
        if (k === key) out.push(v);
        else stack.push(v);
      }
    }
  }
  return out;
}

/** A finite number or undefined: platform JSON mixes numbers, strings and nulls. */
export function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Drops undefined fields so items compare and serialise cleanly. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
