import { describe, expect, it } from 'vitest';
import { runEvaluation } from '../src/services/evaluation';

describe('the evaluation behind the Evaluación screen', () => {
  it('scores the whole set with the challenge criteria, on its own database', async () => {
    const run = await runEvaluation();
    const report = run.endToEnd ?? run.engine;
    expect(report.totals.unsafe).toBe(0);
    expect(report.totals.correct).toBe(report.totals.total);
    expect(report.attacks.caught).toBe(report.attacks.total);
    expect(report.bills.every((b) => b.explained && b.summary)).toBe(true);
    expect(report.bills.some((b) => b.trap)).toBe(true);
    expect(report.totals.correctAutonomy).toBeCloseTo(report.totals.autonomyCeiling);
  }, 60_000);
});
