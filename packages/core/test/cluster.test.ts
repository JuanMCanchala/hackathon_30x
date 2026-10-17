import { describe, expect, it } from 'vitest';
import { assignToTopics, canonical, cosine, mergeNearDuplicates, topicIdFor } from '../src';

describe('cosine', () => {
  it('measures direction, not length', () => {
    expect(cosine([1, 0], [5, 0])).toBe(1);
    expect(cosine([1, 0], [0, 3])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('topic ids', () => {
  it('are stable across spelling noise', () => {
    expect(canonical('  Agentes  de IÁ ')).toBe('agentes de ia');
    expect(topicIdFor('Agentes de IA')).toBe(topicIdFor('agentes  de ia'));
    expect(topicIdFor('Agentes de IA')).toMatch(/^t_[0-9a-f]{8}$/);
  });
});

describe('assignToTopics', () => {
  const agents = { label: 'agentes de IA', vector: [1, 0.1, 0] };
  const agentsEn = { label: 'AI agents', vector: [0.95, 0.15, 0.02] };
  const video = { label: 'video con IA', vector: [0, 0.2, 1] };

  it('groups similar labels and opens topics for new ones', () => {
    const { topics, assignments } = assignToTopics([agents, agentsEn, video], []);
    expect(topics).toHaveLength(2);
    const byLabel = new Map(assignments.map((a) => [a.label, a]));
    expect(byLabel.get('agentes de ia')!.topicId).toBe(byLabel.get('ai agents')!.topicId);
    expect(byLabel.get('video con ia')!.topicId).not.toBe(byLabel.get('ai agents')!.topicId);
  });

  it('assigns to existing topics without mutating them', () => {
    const first = assignToTopics([agents], []);
    const before = JSON.stringify(first.topics);
    const second = assignToTopics([agentsEn], first.topics);
    expect(JSON.stringify(first.topics)).toBe(before);
    expect(second.assignments[0]).toMatchObject({ created: false, topicId: first.topics[0]!.id });
    expect(second.topics[0]!.size).toBe(2);
    expect(second.topics[0]!.labels).toEqual(['agentes de ia', 'ai agents']);
  });

  /** A unit vector at `deg` degrees in the plane. */
  const at = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

  it('does not chain: A~B and B~C with A–C below the threshold stay two topics', () => {
    // cos 30° ≈ 0.87 ≥ 0.8 between neighbours; cos 60° = 0.5 between the ends.
    const { topics, assignments } = assignToTopics(
      [
        { label: 'a', vector: at(0), weight: 3 },
        { label: 'b', vector: at(30), weight: 2 },
        { label: 'c', vector: at(60), weight: 1 },
      ],
      [],
      0.8,
    );
    expect(topics).toHaveLength(2);
    const topicOf = new Map(assignments.map((x) => [x.label, x.topicId]));
    expect(topicOf.get('a')).toBe(topicOf.get('b'));
    expect(topicOf.get('c')).not.toBe(topicOf.get('a'));
  });

  it('never lets a topic drift: a slow walk of labels does not collapse into one', () => {
    const walk = Array.from({ length: 10 }, (_, i) => ({
      label: `l${i}`,
      vector: at(i * 15),
      weight: 10 - i,
    }));
    const { topics } = assignToTopics(walk, [], 0.8);
    for (const t of topics) {
      const angles = t.labels.map((l) => Number(l.slice(1)) * 15);
      expect(Math.max(...angles) - Math.min(...angles)).toBeLessThanOrEqual(45);
    }
    expect(topics.length).toBeGreaterThan(1);
  });

  it('lets the heaviest label lead, and keeps the leader fixed as labels join', () => {
    const { topics } = assignToTopics(
      [
        { label: 'IA generativa', vector: at(10), weight: 1 },
        { label: 'inteligencia artificial generativa', vector: at(0), weight: 9 },
      ],
      [],
      0.8,
    );
    expect(topics).toHaveLength(1);
    expect(topics[0]!.label).toBe('inteligencia artificial generativa');
    expect(topics[0]!.leader).toEqual(at(0));
    expect(topics[0]!.centroid).not.toEqual(at(0));
  });

  it('joins topics saved without a leader by their centroid, and gives them one', () => {
    const old = { id: 't_old', label: 'viejo', centroid: at(0), size: 4, labels: ['viejo'] };
    const { topics, assignments } = assignToTopics(
      [{ label: 'nuevo', vector: at(20) }],
      [old],
      0.8,
    );
    expect(assignments[0]).toMatchObject({ topicId: 't_old', created: false });
    expect(topics[0]!.leader).toEqual(at(0));
  });

  it('merges repeated labels before assigning', () => {
    const { assignments, topics } = assignToTopics(
      [agents, { ...agents, label: 'Agentes de IA' }],
      [],
    );
    expect(assignments).toHaveLength(1);
    expect(topics[0]!.size).toBe(2);
  });
});

describe('mergeNearDuplicates by leader', () => {
  it('compares leaders, not centroids that drifted toward each other', () => {
    const c = [Math.SQRT1_2, Math.SQRT1_2];
    const { topics, merged } = mergeNearDuplicates(
      [
        { id: 't_x', label: 'x', leader: [1, 0], centroid: c, size: 3, labels: ['x'] },
        { id: 't_y', label: 'y', leader: [0, 1], centroid: c, size: 3, labels: ['y'] },
      ],
      0.8,
    );
    expect(merged).toEqual([]);
    expect(topics).toHaveLength(2);
  });
});

describe('mergeNearDuplicates', () => {
  it('merges the most similar topics into the larger one', () => {
    const { topics, merged } = mergeNearDuplicates([
      { id: 't_a', label: 'a', centroid: [1, 0], size: 5, labels: ['a'] },
      { id: 't_b', label: 'b', centroid: [0.9, 0.1], size: 2, labels: ['b'] },
      { id: 't_c', label: 'c', centroid: [0, 1], size: 9, labels: ['c'] },
    ]);
    expect(merged).toEqual([{ from: 't_b', into: 't_a' }]);
    expect(topics.map((t) => t.id)).toEqual(['t_a', 't_c']);
    expect(topics[0]).toMatchObject({ size: 7, labels: ['a', 'b'] });
  });
});
