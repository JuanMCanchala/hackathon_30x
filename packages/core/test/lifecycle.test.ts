import { describe, expect, it } from 'vitest';
import { classifyStage, formingLane, stageContext, timingFor, type StageContext } from '../src';

const ctx: StageContext = { p10: 1, p50: 6, p90: 40 };
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('classifyStage', () => {
  it('calls a topic declining when voices and attention fall two weeks running', () => {
    const r = classifyStage(
      { creators: [10, 10, 9, 8, 6, 4], engagement: [50, 50, 50, 40, 30, 20] },
      ctx,
    );
    expect(r.stage).toBe('declining');
  });

  it('calls a topic saturated when almost everyone is on it', () => {
    const r = classifyStage({ creators: [30, 30, 30, 30, 45], engagement: flat(5, 100) }, ctx);
    expect(r.stage).toBe('saturated');
    expect(r.reason).toContain('45 creadores');
  });

  it('calls a topic saturated when it stops growing and each piece earns less', () => {
    const r = classifyStage(
      { creators: [10, 10, 11, 10, 11], engagement: [200, 180, 150, 120, 100] },
      ctx,
    );
    expect(r.stage).toBe('saturated');
    expect(r.reason).toContain('50 %');
  });

  it('calls a topic growing on its second signal week or with a crowd', () => {
    expect(
      classifyStage({ creators: [1, 1, 1, 1, 4, 9], engagement: flat(6, 10) }, ctx).stage,
    ).toBe('growing');
    expect(classifyStage({ creators: [2, 2, 2, 2, 12], engagement: flat(5, 10) }, ctx).stage).toBe(
      'growing',
    );
  });

  it('calls a topic emerging when it moves with few voices', () => {
    const r = classifyStage({ creators: [1, 0, 1, 0, 4], engagement: flat(5, 10) }, ctx);
    expect(r.stage).toBe('emerging');
    expect(r.signal).toBe(true);
  });

  it('keeps the rest stable, including big lifts on fewer than three voices', () => {
    expect(classifyStage({ creators: [5, 5, 5, 5, 5], engagement: flat(5, 10) }, ctx).stage).toBe(
      'stable',
    );
    const anecdote = classifyStage({ creators: [0, 0, 0, 0, 2], engagement: flat(5, 10) }, ctx);
    expect(anecdote.stage).toBe('stable');
    expect(anecdote.reason).toContain('anécdota');
    expect(classifyStage({ creators: [], engagement: [] }, ctx).stage).toBe('stable');
  });
});

describe('stageContext', () => {
  it('takes percentiles over active topics only', () => {
    const c = stageContext([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(c.p50).toBe(5.5);
    expect(c.p10).toBeCloseTo(1.9);
    expect(c.p90).toBeCloseTo(9.1);
  });

  it('calls nobody saturated by crowd when there are too few topics to rank', () => {
    const c = stageContext([3, 30, 4]);
    expect(c.p90).toBe(Infinity);
    expect(classifyStage({ creators: [3, 3, 3, 3, 30], engagement: flat(5, 10) }, c).stage).toBe(
      'growing',
    );
  });
});

describe('timingFor', () => {
  it('turns stage and fit into advice', () => {
    expect(timingFor('emerging', 8)).toBe('enter-now');
    expect(timingFor('emerging', 5)).toBe('watch');
    expect(timingFor('emerging', null)).toBe('watch');
    expect(timingFor('growing', 2)).toBe('this-week');
    expect(timingFor('saturated', 9)).toBe('own-angle');
    expect(timingFor('declining', 9)).toBe('skip');
    expect(timingFor('stable', 9)).toBe('watch');
  });
});

describe('formingLane', () => {
  it('flags what moves in the technical lane before it reaches LinkedIn and Instagram', () => {
    expect(formingLane(2.5, 0, 0)).toBe(true);
    expect(formingLane(2.5, 3, 1)).toBe(false);
    expect(formingLane(1.2, 0, 0)).toBe(false);
    expect(formingLane(2.5, 0, 0, 2)).toBe(false);
  });
});
