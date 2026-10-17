import { describe, expect, it } from 'vitest';
import { describeLift, featureLift, hourBucketOf, weekdayOf, type FeaturePiece } from '../src';

const p = (id: string, outlier: boolean, hookType: string, format = 'post'): FeaturePiece => ({
  id,
  outlier,
  features: { hookType, format },
});

describe('featureLift', () => {
  const pieces: FeaturePiece[] = [
    ...['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'].map((id) => p(id, true, 'cifra', 'carousel')),
    p('o8', true, 'pregunta'),
    p('o9', true, 'pregunta'),
    p('o10', true, 'historia'),
    ...Array.from({ length: 40 }, (_, i) => p(`r${i}`, false, i < 3 ? 'cifra' : 'pregunta')),
  ];

  it('finds what is over-represented among breakouts, strongest first, with counts and evidence', () => {
    const [first, second] = featureLift(pieces);
    // Carousels: 7 of 10 breakouts and none of the rest. «Cifra» hooks: 7 of 10, and 3 of 40.
    expect(first).toMatchObject({
      feature: 'format',
      value: 'carousel',
      outlierCount: 7,
      restCount: 0,
    });
    expect(first!.lift).toBeCloseTo(0.7 / (7 / 50));
    expect(second).toMatchObject({
      feature: 'hookType',
      value: 'cifra',
      outlierCount: 7,
      outlierTotal: 10,
      restCount: 3,
      restTotal: 40,
    });
    expect(second!.lift).toBeCloseTo(0.7 / (10 / 50));
    expect(second!.pieceIds).toHaveLength(7);
  });

  it('drops patterns with too little support or no lift', () => {
    const results = featureLift(pieces, { top: 10 });
    expect(results.find((r) => r.value === 'historia')).toBeUndefined();
    expect(results.find((r) => r.value === 'pregunta')).toBeUndefined();
    expect(featureLift([])).toEqual([]);
  });

  it('reads as a sentence', () => {
    const hook = featureLift(pieces, { features: ['hookType'] })[0]!;
    expect(describeLift(hook, 'una cifra')).toBe(
      '7 de 10 piezas que despegaron abren con una cifra, frente a 3 de 40 del resto.',
    );
  });
});

describe('date features in Colombia time', () => {
  it('uses UTC−5 for the weekday and the part of the day', () => {
    expect(weekdayOf('2026-10-17T03:00:00Z')).toBe('viernes');
    expect(hourBucketOf('2026-10-17T03:00:00Z')).toBe('noche');
    expect(hourBucketOf('2026-10-17T13:00:00Z')).toBe('mañana');
    expect(hourBucketOf('2026-10-17T20:00:00Z')).toBe('tarde');
    expect(hourBucketOf('2026-10-17T08:00:00Z')).toBe('madrugada');
  });
});
