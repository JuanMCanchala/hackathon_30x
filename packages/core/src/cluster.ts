/**
 * Topics from labels. Each piece names its topics in a few words; their embeddings are grouped
 * so that «agentes de IA», «AI agents» and «agentes autónomos» end up as one topic.
 *
 * Leader clustering: the label that opens a topic is its leader, and a label joins a topic only
 * if it is close enough to that leader. A running mean would drift with every label it absorbs
 * and end up swallowing its neighbours: «Anthropic Scion» and «Anthropic IPO» (0.68 apart) both
 * landed in one topic, and a regulation topic absorbed every neighbour on its way to a thousand
 * creators. The mean is still kept, for display and nothing else.
 *
 * Deterministic: heavier labels lead, ties go alphabetically, so the same labels give the same
 * topics whatever order they arrive in.
 */

export const MERGE_THRESHOLD = 0.7;

export function dot(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i += 1) s += a[i]! * b[i]!;
  return s;
}

export function norm(a: readonly number[]): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: readonly number[]): number[] {
  const l = norm(a);
  return l > 0 ? a.map((x) => x / l) : a.map(() => 0);
}

/** Cosine similarity; 0 when either vector is empty or all zeros, or their lengths differ. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  const l = norm(a) * norm(b);
  return l > 0 ? dot(a, b) / l : 0;
}

/** A stable id from a label: FNV-1a over the normalized text. */
export function topicIdFor(label: string): string {
  const text = canonical(label);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `t_${h.toString(16).padStart(8, '0')}`;
}

/** Lowercase, without accents or extra spaces: «Agentes  de IA» and «agentes de ia» are one label. */
export function canonical(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface LabelVector {
  label: string;
  vector: readonly number[];
  /** How many pieces used the label; heavier labels pull the centroid more. Default 1. */
  weight?: number;
}

export interface TopicCentroid {
  id: string;
  /** The label that opened the topic. */
  label: string;
  /**
   * Unit vector of the label that opened the topic. Labels join a topic by their similarity to
   * it. Topics saved before leaders existed fall back to their centroid.
   */
  leader?: number[];
  /** Unit vector: the running mean of its labels' unit vectors. For display, never for joining. */
  centroid: number[];
  /** Total weight of the labels assigned to it. */
  size: number;
  /** Canonical labels assigned to it, sorted. */
  labels: string[];
}

export interface Assignment {
  label: string;
  topicId: string;
  similarity: number;
  /** True when the label opened a new topic. */
  created: boolean;
}

function absorb(topic: TopicCentroid, unit: readonly number[], weight: number, label: string) {
  const total = topic.size + weight;
  const mixed = topic.centroid.map((x, i) => (x * topic.size + (unit[i] ?? 0) * weight) / total);
  topic.centroid = normalize(mixed);
  topic.size = total;
  if (!topic.labels.includes(label)) {
    topic.labels.push(label);
    topic.labels.sort();
  }
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** A copy that can be updated, with its leader set (the centroid for topics saved without one). */
const working = (t: TopicCentroid): TopicCentroid & { leader: number[] } => ({
  ...t,
  leader: normalize(t.leader ?? t.centroid),
  centroid: normalize(t.centroid),
  labels: [...t.labels],
});

/**
 * Assigns each label to the topic whose leader it is most similar to, when the similarity
 * reaches `threshold`; otherwise the label opens a topic and leads it. Same labels are merged
 * first; heavier labels go first. Existing topics are not mutated: updated copies are returned.
 */
export function assignToTopics(
  labels: readonly LabelVector[],
  existing: readonly TopicCentroid[],
  threshold = MERGE_THRESHOLD,
): { topics: TopicCentroid[]; assignments: Assignment[] } {
  const merged = new Map<string, { vector: number[]; weight: number }>();
  for (const l of labels) {
    const key = canonical(l.label);
    if (!key) continue;
    const unit = normalize(l.vector);
    const w = l.weight ?? 1;
    const prev = merged.get(key);
    if (prev) {
      prev.vector = normalize(prev.vector.map((x, i) => x * prev.weight + (unit[i] ?? 0) * w));
      prev.weight += w;
    } else {
      merged.set(key, { vector: unit, weight: w });
    }
  }

  const topics = existing.map(working).sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set(topics.map((t) => t.id));
  const assignments: Assignment[] = [];
  const order = [...merged.entries()].sort(
    ([a, x], [b, y]) => y.weight - x.weight || a.localeCompare(b),
  );

  for (const [key, { vector, weight }] of order) {
    let best: (typeof topics)[number] | null = null;
    let bestSim = -Infinity;
    for (const t of topics) {
      const sim = dot(t.leader, vector);
      if (sim > bestSim + 1e-12) {
        best = t;
        bestSim = sim;
      }
    }
    if (best && bestSim >= threshold) {
      absorb(best, vector, weight, key);
      assignments.push({ label: key, topicId: best.id, similarity: bestSim, created: false });
    } else {
      const id = uniqueId(topicIdFor(key), taken);
      taken.add(id);
      topics.push({
        id,
        label: key,
        leader: [...vector],
        centroid: [...vector],
        size: weight,
        labels: [key],
      });
      topics.sort((a, b) => a.id.localeCompare(b.id));
      assignments.push({ label: key, topicId: id, similarity: 1, created: true });
    }
  }
  assignments.sort((a, b) => a.label.localeCompare(b.label));
  return { topics, assignments };
}

/**
 * Merges topics whose leaders are at least `threshold` alike, the most similar pair first, until
 * none is left. The larger topic keeps its id and its leader (ties: the smaller id).
 */
export function mergeNearDuplicates(
  topics: readonly TopicCentroid[],
  threshold = MERGE_THRESHOLD,
): { topics: TopicCentroid[]; merged: { from: string; into: string }[] } {
  const all = topics.map(working).sort((a, b) => a.id.localeCompare(b.id));
  const n = all.length;
  const alive = new Array<boolean>(n).fill(true);
  // Leaders never move, so each similarity is computed once.
  const sim: number[][] = all.map(() => new Array<number>(n).fill(-Infinity));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) sim[i]![j] = dot(all[i]!.leader, all[j]!.leader);
  }
  const merged: { from: string; into: string }[] = [];

  for (;;) {
    let pair: [number, number] | null = null;
    let bestSim = threshold - 1e-12;
    for (let i = 0; i < n; i += 1) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < n; j += 1) {
        if (alive[j] && sim[i]![j]! > bestSim) {
          bestSim = sim[i]![j]!;
          pair = [i, j];
        }
      }
    }
    if (!pair) break;
    const [i, j] = pair;
    const a = all[i]!;
    const b = all[j]!;
    const keepA = a.size > b.size || (a.size === b.size && a.id < b.id);
    const [k, d] = keepA ? [i, j] : [j, i];
    const keep = all[k]!;
    const drop = all[d]!;
    const total = keep.size + drop.size;
    keep.centroid = normalize(
      keep.centroid.map(
        (x, idx) => (x * keep.size + (drop.centroid[idx] ?? 0) * drop.size) / total,
      ),
    );
    keep.size = total;
    keep.labels = [...new Set([...keep.labels, ...drop.labels])].sort();
    alive[d] = false;
    merged.push({ from: drop.id, into: keep.id });
    // The kept topic's leader is unchanged, so its similarities to the rest stay valid.
  }
  return { topics: all.filter((_, i) => alive[i]), merged };
}
