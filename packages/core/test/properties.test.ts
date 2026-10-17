/**
 * Properties that must hold for any input, not just the examples: the ranking never rewards
 * less growth, every topic gets exactly one stage, clustering does not depend on arrival order,
 * and the detector does not fire on flat series.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addWeeks,
  assignToTopics,
  classifyStage,
  momentum,
  signalWeeks,
  STAGES,
  stageContext,
} from '../src';

describe('properties', () => {
  it('momentum never decreases when lift, creators or platforms grow', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 4 }),
        (l1, l2, c1, c2, p, extra) => {
          const [lo, hi] = l1 <= l2 ? [l1, l2] : [l2, l1];
          const [few, many] = c1 <= c2 ? [c1, c2] : [c2, c1];
          expect(momentum(hi, many, p)).toBeGreaterThanOrEqual(momentum(lo, many, p));
          expect(momentum(hi, many, p)).toBeGreaterThanOrEqual(momentum(hi, few, p));
          expect(momentum(hi, many, p + extra)).toBeGreaterThanOrEqual(momentum(hi, many, p));
          expect(momentum(hi, many, p)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('gives every topic exactly one known stage', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 5000 })), {
          maxLength: 14,
        }),
        fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 30 }),
        (weeks, others) => {
          const r = classifyStage(
            { creators: weeks.map(([c]) => c), engagement: weeks.map(([, e]) => e) },
            stageContext(others),
          );
          expect(STAGES).toContain(r.stage);
          expect(r.reason.length).toBeGreaterThan(0);
          expect(Number.isFinite(r.lift)).toBe(true);
        },
      ),
    );
  });

  it('clusters the same labels into the same topics whatever their order', () => {
    const vector = fc.array(fc.double({ min: -1, max: 1, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), vector), {
          selector: ([label]) => label,
          minLength: 1,
          maxLength: 12,
        }),
        fc.integer(),
        (entries, seed) => {
          const labels = entries.map(([label, v]) => ({ label, vector: v }));
          const shuffled = [...labels].sort(
            (a, b) => ((a.label.charCodeAt(0) * seed) % 7) - ((b.label.charCodeAt(0) * seed) % 7),
          );
          const a = assignToTopics(labels, []);
          const b = assignToTopics(shuffled, []);
          expect(b.topics).toEqual(a.topics);
          expect([...b.assignments].sort((x, y) => x.label.localeCompare(y.label))).toEqual(
            [...a.assignments].sort((x, y) => x.label.localeCompare(y.label)),
          );
        },
      ),
    );
  });

  it('never fires on a flat series with mild noise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 100_000 }),
        fc.array(fc.double({ min: -0.25, max: 0.25, noNaN: true }), {
          minLength: 10,
          maxLength: 60,
        }),
        (level, noise) => {
          const points = noise.map((n, k) => ({
            date: addWeeks('2025-01-06', k),
            value: level * (1 + n),
          }));
          expect(signalWeeks(points)).toEqual([]);
        },
      ),
    );
  });
});
