/**
 * The radar's store. Pieces arrive from public sources (or the community sensor), each capture
 * adds a metrics snapshot, the language model labels each piece once, labels cluster into topics,
 * and the scores are computed from these tables on demand.
 */
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** One public piece: a post, reel, video, tweet, repo, paper or headline. */
export const items = pgTable(
  'items',
  {
    /** `<platform>:<externalId>`. */
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    authorId: text('author_id').notNull(),
    authorName: text('author_name').notNull(),
    authorHandle: text('author_handle'),
    authorFollowers: integer('author_followers'),
    publishedAt: ts('published_at').notNull(),
    publishedApprox: boolean('published_approx').notNull().default(false),
    title: text('title'),
    text: text('text').notNull(),
    format: text('format').notNull(),
    lang: text('lang'),
    durationSec: integer('duration_sec'),
    /** The search query that found it first. */
    query: text('query'),
    /** Latest metrics read, also kept per capture in item_metrics. */
    views: doublePrecision('views'),
    likes: doublePrecision('likes'),
    comments: doublePrecision('comments'),
    shares: doublePrecision('shares'),
    saves: doublePrecision('saves'),
    engagement: doublePrecision('engagement').notNull().default(0),
    /** Published by one of 30X's reference profiles (30X itself, Andrés Bilbao). */
    reference: boolean('reference').notNull().default(false),
    /** Sent by someone through the community sensor. */
    viaSensor: boolean('via_sensor').notNull().default(false),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
  },
  (t) => [
    index('items_platform_idx').on(t.platform),
    index('items_published_idx').on(t.publishedAt),
    index('items_author_idx').on(t.platform, t.authorId),
  ],
);

/** The metrics of a piece at each capture: views and likes over time give its velocity. */
export const itemMetrics = pgTable(
  'item_metrics',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    capturedAt: ts('captured_at').notNull(),
    views: doublePrecision('views'),
    likes: doublePrecision('likes'),
    comments: doublePrecision('comments'),
    shares: doublePrecision('shares'),
    saves: doublePrecision('saves'),
    engagement: doublePrecision('engagement').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.capturedAt] })],
);

/** What the language model read in a piece, once per piece and prompt version. */
export const enrichments = pgTable('enrichments', {
  itemId: text('item_id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  isAi: boolean('is_ai').notNull(),
  labels: jsonb('labels').$type<string[]>().notNull(),
  format: text('format'),
  hookType: text('hook_type'),
  hook: text('hook'),
  emotion: text('emotion'),
  audience: text('audience'),
  authorType: text('author_type'),
  useCase: text('use_case'),
  lang: text('lang'),
  country: text('country'),
  createdAt: ts('created_at').notNull(),
});

/** A theme many pieces talk about, with a stable id across runs. */
export const topics = pgTable('topics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  definition: text('definition'),
  /** English Wikipedia article title, for long history. */
  wikipedia: text('wikipedia'),
  queries: jsonb('queries').$type<string[]>().notNull().default([]),
  /** The vector of the label that opened the topic: new labels join by similarity to it. */
  leader: jsonb('leader').$type<number[]>(),
  /** The running mean of its labels, for display and merges. */
  centroid: jsonb('centroid').$type<number[]>().notNull(),
  labelCount: integer('label_count').notNull().default(0),
  /** Too broad to be a trend ("IA", "tecnología"): kept for assignment, hidden from the radar. */
  generic: boolean('generic').notNull().default(false),
  named: boolean('named').notNull().default(false),
  createdAt: ts('created_at').notNull(),
});

/** Each distinct label the model wrote, and the topic it fell into. */
export const topicLabels = pgTable('topic_labels', {
  label: text('label').primaryKey(),
  topicId: text('topic_id')
    .notNull()
    .references(() => topics.id, { onDelete: 'cascade' }),
  similarity: real('similarity').notNull(),
});

export const itemTopics = pgTable(
  'item_topics',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.topicId] }),
    index('item_topics_topic_idx').on(t.topicId),
  ],
);

/** Long history per topic from sources that keep it (Wikipedia, Hacker News, Bluesky). */
export const topicSeries = pgTable(
  'topic_series',
  {
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    value: doublePrecision('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.source, t.date] })],
);

/** Written analyses of a topic in a given week: why it works, fit with 30X, the headline. */
export const analyses = pgTable(
  'analyses',
  {
    topicId: text('topic_id').notNull(),
    week: date('week', { mode: 'string' }).notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.week, t.kind] })],
);

/** Ready-to-publish versions of a topic for 30X's formats. */
export const adaptations = pgTable('adaptations', {
  id: text('id').primaryKey(),
  topicId: text('topic_id')
    .notNull()
    .references(() => topics.id, { onDelete: 'cascade' }),
  week: date('week', { mode: 'string' }).notNull(),
  variant: integer('variant').notNull().default(0),
  payload: jsonb('payload').notNull(),
  createdAt: ts('created_at').notNull(),
});

/** The content calendar: an adaptation a person approved, with its format and day. */
export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  adaptationId: text('adaptation_id')
    .notNull()
    .references(() => adaptations.id, { onDelete: 'cascade' }),
  topicId: text('topic_id').notNull(),
  format: text('format').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scheduledFor: date('scheduled_for', { mode: 'string' }).notNull(),
  approvedBy: text('approved_by').notNull(),
  approvedAt: ts('approved_at').notNull(),
});

/** A link someone sent through the community sensor. */
export const sensorSubmissions = pgTable('sensor_submissions', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
  submittedBy: text('submitted_by').notNull(),
  note: text('note'),
  status: text('status').notNull(),
  createdAt: ts('created_at').notNull(),
});

/** Every pipeline run, with what it did and what it cost. */
export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  costUsd: doublePrecision('cost_usd').notNull().default(0),
});

/** Language-model calls, live or replayed, for the cost of the week. */
export const llmUsage = pgTable('llm_usage', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: doublePrecision('cost_usd').notNull(),
  replayed: boolean('replayed').notNull(),
  at: ts('at').notNull(),
});
