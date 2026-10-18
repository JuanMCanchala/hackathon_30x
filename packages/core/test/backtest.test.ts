import { describe, expect, it } from 'vitest';
import {
  addWeeks,
  BURST_P,
  describeBacktest,
  topicSignals,
  peakOf,
  runBacktest,
  signalWeeks,
  usableSources,
  type BacktestSeriesFile,
  type Point,
} from '../src';

const START = '2024-10-07';
const WEEKS = 105;

function series(fn: (k: number) => number): Point[] {
  return Array.from({ length: WEEKS }, (_, k) => ({
    date: addWeeks(START, k),
    value: Math.round(fn(k)),
  }));
}

/** A deterministic wobble of ±10 % around `level`. */
const noisy = (level: number) => (k: number) =>
  level * (1 + 0.1 * Math.sin(k * 1.7) * Math.cos(k * 0.3));
/** A bump centred on week `peak` that rises and falls over a few weeks. */
const wave =
  (peak: number, height: number, base = 20) =>
  (k: number) =>
    base + height * Math.exp(-((k - peak) ** 2) / (2 * 3 ** 2));

const file = (
  id: string,
  kind: 'wave' | 'control',
  fn: (k: number) => number,
): BacktestSeriesFile => ({
  id,
  name: id,
  kind,
  weeks: WEEKS,
  hn: { query: id, weekly: series(fn) },
  wikipedia: { articles: [{ lang: 'en', title: id }], weekly: series((k) => fn(k) * 100) },
});

describe('signalWeeks', () => {
  it('finds a rising wave before its peak and stays quiet on flat noise', () => {
    const w = series(wave(60, 2000));
    const first = signalWeeks(w)[0]!;
    expect(first < addWeeks(START, 60)).toBe(true);
    expect(peakOf(w).week).toBe(addWeeks(START, 60));
    expect(signalWeeks(series(noisy(300)))).toEqual([]);
  });

  it('ignores weeks before the evaluation starts', () => {
    expect(signalWeeks(series(wave(10, 2000)), addWeeks(START, 30))).toEqual([]);
  });

  it('drops a lift that Poisson noise explains only when the burst check is on', () => {
    // 3, 3, 3, 3 then 7: twice the level (lift 2), but P(X ≥ 7 | 3) is about 3 %.
    const small = [3, 3, 3, 3, 7].map((value, k) => ({ date: addWeeks(START, k), value }));
    expect(signalWeeks(small)).toEqual([addWeeks(START, 4)]);
    expect(signalWeeks(small, '', BURST_P)).toEqual([]);
  });
});

describe('topicSignals', () => {
  const trace = (source: 'hn' | 'wikipedia' | 'bluesky', weeks: string[]) => ({
    source,
    signalWeeks: weeks,
    peakWeek: null,
    peakValue: 0,
  });

  it('confirms a signal only when a second source agrees within four weeks', () => {
    const traces = [trace('hn', ['2025-03-03']), trace('wikipedia', ['2025-03-24', '2025-06-02'])];
    expect(topicSignals(traces, 'confirmed')).toEqual([
      { week: '2025-03-24', sources: ['hn', 'wikipedia'] },
    ]);
    expect(topicSignals(traces, 'any').map((s) => s.week)).toEqual([
      '2025-03-03',
      '2025-03-24',
      '2025-06-02',
    ]);
  });

  it('never confirms a lone source', () => {
    expect(topicSignals([trace('hn', ['2025-01-06', '2025-01-13'])], 'confirmed')).toEqual([]);
  });
});

describe('runBacktest', () => {
  const files = [
    file('ola-a', 'wave', wave(40, 3000)),
    file('ola-b', 'wave', wave(70, 800)),
    file('estable', 'control', noisy(500)),
    file('otro-estable', 'control', noisy(80)),
  ];
  const report = runBacktest(files);

  it('detects every synthetic wave in its run-up and raises no false alarm', () => {
    expect(report.sources).toEqual(['wikipedia', 'hn']);
    expect(report.summary).toMatchObject({ waves: 2, detected: 2, controls: 2, falseAlarms: 0 });
    for (const w of report.waves) {
      expect(w.detected).toBe(true);
      expect(w.leadDays).toBeGreaterThanOrEqual(0);
      expect(w.peakSource).toBe('wikipedia');
    }
    expect(report.passed).toBe(true);
  });

  it('measures how far the technical lane runs ahead', () => {
    expect(report.waves[0]!.hnToWikipediaPeakDays).toBe(0);
    expect(report.summary.medianHnToWikipediaSignalDays).toBe(0);
    // Same shapes, but Hacker News has 100× fewer counts: the burst check waits for more
    // evidence there, so with it Hacker News never moves first.
    expect(report.withBurst.medianHnToWikipediaSignalDays).toBeLessThan(0);
  });

  it('reports the same rule with the Poisson check, for comparison only', () => {
    expect(report.params.burstP).toBe(BURST_P);
    expect(report.withBurst).toMatchObject({ waves: 2, detected: 2, falseAlarms: 0 });
    expect(describeBacktest(report).join('\n')).toContain('Con la prueba de Poisson');
  });

  it('only uses sources every control has, so waves and controls are judged alike', () => {
    const partial = [...files.slice(0, 3), { ...files[3]!, hn: undefined }];
    expect(usableSources(partial)).toEqual(['wikipedia']);
  });

  it('fails the gate when a control keeps alarming', () => {
    const bad = runBacktest([
      file('ola', 'wave', wave(40, 3000)),
      file('ruido', 'control', wave(50, 3000)),
    ]);
    expect(bad.summary.falseAlarms).toBe(1);
    expect(bad.passed).toBe(false);
    expect(describeBacktest(bad).at(-1)).toContain('NO pasa');
  });
});
