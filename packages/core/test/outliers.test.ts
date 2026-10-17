import { describe, expect, it } from 'vitest';
import { bandOf, outlierScores, velocity, type PieceEngagement } from '../src';

const piece = (
  id: string,
  authorId: string,
  engagement: number,
  day: number,
  extra: Partial<PieceEngagement> = {},
): PieceEngagement => ({
  id,
  authorId,
  engagement,
  platform: 'linkedin',
  format: 'post',
  publishedAt: new Date(Date.UTC(2026, 9, 1 + day)).toISOString(),
  ...extra,
});

describe('outlierScores', () => {
  it("compares a piece with its author's usual engagement", () => {
    const pieces = [
      piece('a1', 'ana', 100, 0),
      piece('a2', 'ana', 120, 1),
      piece('a3', 'ana', 80, 2),
      piece('a4', 'ana', 1_000, 3),
    ];
    const s = outlierScores(pieces).get('a4')!;
    expect(s.baselineKind).toBe('author');
    expect(s.baseline).toBe(100);
    expect(s.ratio).toBe(10);
    expect(s.band).toBe('10x');
  });

  it('falls back to peers of the same platform and format', () => {
    const pieces = [
      piece('p1', 'a', 10, 0),
      piece('p2', 'b', 10, 0),
      piece('p3', 'c', 10, 0),
      piece('new', 'd', 60, 1),
    ];
    const s = outlierScores(pieces).get('new')!;
    expect(s.baselineKind).toBe('peers');
    expect(s.ratio).toBe(6);
    expect(s.band).toBe('5x');
  });

  it('scores 1 when there is nothing to compare with', () => {
    const s = outlierScores([piece('solo', 'x', 500, 0)]).get('solo')!;
    expect(s).toMatchObject({ ratio: 1, band: 'none', baselineKind: 'none' });
  });

  it('never divides by a zero baseline', () => {
    const pieces = [
      piece('z1', 'z', 0, 0),
      piece('z2', 'z', 0, 1),
      piece('z3', 'z', 0, 2),
      piece('z4', 'z', 7, 3),
    ];
    expect(outlierScores(pieces).get('z4')!.ratio).toBe(7);
  });

  it('bands at 2×, 5× and 10×', () => {
    expect(bandOf(1.9)).toBe('none');
    expect(bandOf(2)).toBe('2x');
    expect(bandOf(5)).toBe('5x');
    expect(bandOf(12)).toBe('10x');
  });
});

describe('velocity', () => {
  it('measures engagement per hour between the two latest captures', () => {
    expect(
      velocity([
        { capturedAt: '2026-10-17T10:00:00Z', engagement: 100 },
        { capturedAt: '2026-10-17T14:00:00Z', engagement: 300 },
        { capturedAt: '2026-10-17T12:00:00Z', engagement: 200 },
      ]),
    ).toBe(50);
  });

  it('needs two captures and never goes negative', () => {
    expect(velocity([{ capturedAt: '2026-10-17T10:00:00Z', engagement: 1 }])).toBeNull();
    expect(
      velocity([
        { capturedAt: '2026-10-17T10:00:00Z', engagement: 100 },
        { capturedAt: '2026-10-17T12:00:00Z', engagement: 90 },
      ]),
    ).toBe(0);
  });
});
