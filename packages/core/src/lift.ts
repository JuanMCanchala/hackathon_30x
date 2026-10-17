/**
 * Why pieces took off, counted rather than guessed: which hooks, formats, days, hours and kinds
 * of author show up more among the pieces that broke out than among all of them. The language
 * model writes the explanation from these counts; it does not invent the pattern.
 */
import { AUTHOR_TIER_LABEL, type AuthorTier } from './engagement';

export type FeatureName =
  'hookType' | 'format' | 'weekday' | 'hourBucket' | 'authorTier' | 'authorType' | 'emotion';

export const FEATURES: readonly FeatureName[] = [
  'hookType',
  'format',
  'weekday',
  'hourBucket',
  'authorTier',
  'authorType',
  'emotion',
];

/** A pattern needs at least this many breakout pieces showing it. */
export const MIN_SUPPORT = 3;

export interface FeaturePiece {
  id: string;
  /** Took off: an outlier band of 2× or more. */
  outlier: boolean;
  features: Partial<Record<FeatureName, string | null | undefined>>;
}

export interface FeatureLift {
  feature: FeatureName;
  value: string;
  /** Breakout pieces with the feature, and all breakout pieces: «7 de 10». */
  outlierCount: number;
  outlierTotal: number;
  /** The same for the pieces that did not break out. */
  restCount: number;
  restTotal: number;
  outlierShare: number;
  restShare: number;
  allShare: number;
  /** P(feature | breakout) ÷ P(feature | all pieces). Above 1, the feature is over-represented. */
  lift: number;
  /** The breakout pieces that show it, as evidence. */
  pieceIds: string[];
}

export function featureLift(
  pieces: readonly FeaturePiece[],
  options: { minSupport?: number; top?: number; features?: readonly FeatureName[] } = {},
): FeatureLift[] {
  const minSupport = options.minSupport ?? MIN_SUPPORT;
  const outliers = pieces.filter((p) => p.outlier);
  const rest = pieces.filter((p) => !p.outlier);
  if (!outliers.length || !pieces.length) return [];

  const results: FeatureLift[] = [];
  for (const feature of options.features ?? FEATURES) {
    const values = new Set<string>();
    for (const p of outliers) {
      const v = p.features[feature];
      if (v) values.add(v);
    }
    for (const value of [...values].sort()) {
      const has = (p: FeaturePiece) => p.features[feature] === value;
      const withIt = outliers.filter(has);
      if (withIt.length < minSupport) continue;
      const restCount = rest.filter(has).length;
      const outlierShare = withIt.length / outliers.length;
      const allShare = (withIt.length + restCount) / pieces.length;
      const lift = outlierShare / allShare;
      if (!(lift > 1)) continue;
      results.push({
        feature,
        value,
        outlierCount: withIt.length,
        outlierTotal: outliers.length,
        restCount,
        restTotal: rest.length,
        outlierShare,
        restShare: rest.length ? restCount / rest.length : 0,
        allShare,
        lift,
        pieceIds: withIt.map((p) => p.id).sort(),
      });
    }
  }
  results.sort(
    (a, b) =>
      b.lift - a.lift ||
      b.outlierCount - a.outlierCount ||
      a.feature.localeCompare(b.feature) ||
      a.value.localeCompare(b.value),
  );
  return results.slice(0, options.top ?? 3);
}

// ---------------------------------------------------------------------------------------------
// Features from dates, in Colombia's time (UTC−5, no daylight saving): the audience's clock.

const BOGOTA_OFFSET_MS = -5 * 3_600_000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const local = (iso: string) => new Date(Date.parse(iso) + BOGOTA_OFFSET_MS);

export function weekdayOf(iso: string): string {
  return WEEKDAYS[local(iso).getUTCDay()]!;
}

/** madrugada (0–6 h), mañana (6–12 h), tarde (12–18 h) or noche (18–24 h). */
export function hourBucketOf(iso: string): string {
  const h = local(iso).getUTCHours();
  if (h < 6) return 'madrugada';
  if (h < 12) return 'mañana';
  if (h < 18) return 'tarde';
  return 'noche';
}

/** «7 de 10 piezas que despegaron abren con una cifra, frente a 3 de 40 del resto». */
export function describeLift(l: FeatureLift, valueLabel: string = l.value): string {
  const phrase: Record<FeatureName, string> = {
    hookType: `abren con ${valueLabel}`,
    format: `son ${valueLabel}`,
    weekday: `salieron un ${valueLabel}`,
    hourBucket: `salieron en la ${valueLabel}`,
    authorTier: `son de cuentas con ${AUTHOR_TIER_LABEL[l.value as AuthorTier] ?? valueLabel}`,
    authorType: `las publicó ${valueLabel}`,
    emotion: `apelan a ${valueLabel}`,
  };
  const head = `${l.outlierCount} de ${l.outlierTotal} piezas que despegaron ${phrase[l.feature]}`;
  return l.restTotal ? `${head}, frente a ${l.restCount} de ${l.restTotal} del resto.` : `${head}.`;
}
