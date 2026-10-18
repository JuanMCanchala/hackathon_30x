import { describe, expect, it } from 'vitest';
import {
  addWeeks,
  burstAt,
  daysBetween,
  isSignal,
  liftAt,
  momentum,
  rollingWindows,
  seriesByTopic,
  seriesByTopicWindows,
  weekOf,
  weekRange,
  weeklySeries,
  weeksEndingAt,
  windowIndexOf,
  windowSeries,
  type TopicPiece,
} from '../src';

describe('calendar weeks', () => {
  it('names a week by its Monday, in UTC', () => {
    expect(weekOf('2026-10-17T12:00:00Z')).toBe('2026-10-12'); // Saturday
    expect(weekOf('2026-10-12T00:00:00Z')).toBe('2026-10-12'); // Monday
    expect(weekOf('2026-10-18T23:59:59Z')).toBe('2026-10-12'); // Sunday
    expect(weekOf('2026-10-19')).toBe('2026-10-19');
    expect(() => weekOf('no es fecha')).toThrow(RangeError);
  });

  it('walks and counts weeks', () => {
    expect(addWeeks('2026-10-12', -2)).toBe('2026-09-28');
    expect(weekRange('2026-09-30', '2026-10-17')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
    expect(weeksEndingAt('2026-10-17', 3)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(daysBetween('2026-10-05', '2026-10-19')).toBe(14);
  });
});

describe('lift and momentum', () => {
  it('compares a week with the mean of the four before, plus one', () => {
    expect(liftAt([2, 2, 2, 2, 9])).toBe(10 / 3);
    expect(liftAt([0, 0, 0, 0, 0])).toBe(1);
    expect(liftAt([5])).toBe(6);
  });

  it('asks how likely this week is as Poisson noise around the same baseline', () => {
    // P(X ≥ 9 | mean 2): nine voices where two were usual is a burst, not noise.
    expect(burstAt([2, 2, 2, 2, 9])).toBeCloseTo(0.0002374473282610312, 12);
    expect(burstAt([2, 2, 2, 2, 2])).toBeGreaterThan(0.3);
    expect(burstAt([1, 1, 2, 2, 4, 0], 4)).toBeCloseTo(0.06564245437845018, 12);
    expect(burstAt([0, 0, 0, 0, 0])).toBe(1);
    expect(burstAt([5])).toBe(0);
    expect(burstAt([], 0)).toBe(1);
  });

  it('needs 1.8× and three voices to call it a signal', () => {
    expect(isSignal(1.8, 3)).toBe(true);
    expect(isSignal(1.79, 30)).toBe(false);
    expect(isSignal(4, 2)).toBe(false);
  });

  it('gives no momentum to what does not grow, and more to wider waves', () => {
    expect(momentum(1, 50)).toBe(0);
    expect(momentum(0.5, 50, 4)).toBe(0);
    expect(momentum(3, 0)).toBe(0);
    expect(momentum(3, 10, 3)).toBeGreaterThan(momentum(3, 10, 1));
    expect(momentum(3, 20)).toBeGreaterThan(momentum(3, 5));
  });
});

const piece = (
  authorId: string,
  publishedAt: string,
  extra: Partial<TopicPiece> = {},
): TopicPiece => ({
  topicId: 't',
  platform: 'linkedin',
  authorId,
  publishedAt,
  engagement: 10,
  ...extra,
});

describe('weekly series', () => {
  it('counts distinct creators, not pieces, and zero-fills quiet weeks', () => {
    const weeks = ['2026-09-28', '2026-10-05', '2026-10-12'];
    const series = weeklySeries(
      [
        piece('ana', '2026-10-13T10:00:00Z', { engagement: 4 }),
        piece('ana', '2026-10-14T10:00:00Z', { engagement: 8 }),
        piece('ana', '2026-10-15T10:00:00Z', { platform: 'instagram', engagement: 30 }),
        piece('beto', '2026-10-01T10:00:00Z'),
        piece('caro', '2025-01-01T10:00:00Z'),
      ],
      weeks,
    );
    expect(series.map((w) => w.creators)).toEqual([1, 0, 2]);
    expect(series[2]).toMatchObject({
      pieces: 3,
      medianEngagement: 8,
      platforms: ['instagram', 'linkedin'],
    });
    expect(series[1]).toMatchObject({ creators: 0, pieces: 0, medianEngagement: 0, platforms: [] });
  });

  it('groups by topic in a stable order', () => {
    const map = seriesByTopic(
      [
        piece('a', '2026-10-13T00:00:00Z', { topicId: 'b' }),
        piece('a', '2026-10-13T00:00:00Z', { topicId: 'a' }),
      ],
      ['2026-10-12'],
    );
    expect([...map.keys()]).toEqual(['a', 'b']);
  });
});

describe('rolling windows', () => {
  it('ends at asOf and goes back in whole weeks, oldest first', () => {
    const w = rollingWindows('2026-10-19T15:00:00.000Z', 3);
    expect(w).toEqual([
      { start: '2026-09-28T15:00:00.000Z', end: '2026-10-05T15:00:00.000Z', label: '2026-10-05' },
      { start: '2026-10-05T15:00:00.000Z', end: '2026-10-12T15:00:00.000Z', label: '2026-10-12' },
      { start: '2026-10-12T15:00:00.000Z', end: '2026-10-19T15:00:00.000Z', label: '2026-10-19' },
    ]);
  });

  it('puts a boundary instant in the window it ends', () => {
    const w = rollingWindows('2026-10-19T15:00:00Z', 2);
    expect(windowIndexOf('2026-10-19T15:00:00Z', w)).toBe(1);
    expect(windowIndexOf('2026-10-12T15:00:00Z', w)).toBe(0);
    expect(windowIndexOf('2026-10-12T15:00:01Z', w)).toBe(1);
    expect(windowIndexOf('2026-10-19T15:00:01Z', w)).toBe(-1);
    expect(windowIndexOf('2026-10-05T15:00:00Z', w)).toBe(-1);
  });

  it('shows steady daily activity at a lift of about 1, whatever the weekday of asOf', () => {
    // Every day from June 20 to early November at 14:00 UTC, two creators of the day publish.
    const pieces: TopicPiece[] = [];
    for (let d = 0; d < 140; d += 1) {
      const day = new Date(Date.UTC(2026, 5, 20 + d, 14));
      pieces.push(
        piece(`a${d}`, day.toISOString()),
        piece(`b${d}`, day.toISOString(), { platform: 'x' }),
      );
    }
    for (let offset = 0; offset < 7; offset += 1) {
      for (const hour of [0, 9, 14, 23]) {
        const asOf = new Date(Date.UTC(2026, 9, 12 + offset, hour)).toISOString();
        const series = windowSeries(pieces, rollingWindows(asOf, 12));
        expect(series.at(-1)!.creators).toBe(14);
        expect(liftAt(series.map((s) => s.creators))).toBeCloseTo(1, 5);
      }
    }
  });

  it('avoids the Monday dip a calendar week would show', () => {
    const pieces: TopicPiece[] = [];
    for (let d = 0; d < 60; d += 1) {
      pieces.push(piece(`c${d}`, new Date(Date.UTC(2026, 7, 20 + d, 14)).toISOString()));
    }
    const monday = '2026-10-19T15:00:00Z';
    const calendar = weeklySeries(
      pieces.filter((p) => p.publishedAt <= monday),
      weekRange('2026-09-14', monday),
    );
    expect(liftAt(calendar.map((w) => w.creators))).toBeLessThan(0.5);
    const rolling = windowSeries(pieces, rollingWindows(monday, 8));
    expect(rolling.at(-1)!.creators).toBeGreaterThan(0);
  });

  it('groups windows by topic', () => {
    const w = rollingWindows('2026-10-19T00:00:00Z', 1);
    const map = seriesByTopicWindows([piece('a', '2026-10-18T00:00:00Z', { topicId: 'z' })], w);
    expect(map.get('z')![0]).toMatchObject({ week: '2026-10-19', creators: 1 });
  });
});
