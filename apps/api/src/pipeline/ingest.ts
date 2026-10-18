/**
 * Turns capture runs into pieces: each run is parsed once, its pieces are upserted with their
 * latest metrics, and every capture adds a metrics snapshot so the radar can measure velocity.
 */
import { basename } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { engagementOf, type RawItem } from '@radar/core';
import { listRuns, parseRun } from '@radar/sources';
import { itemMetrics, items, runs } from '../db/schema';
import { newId } from '../lib/common';
import type { Deps } from '../services/deps';
import { isReference } from '../services/references';

const CHUNK = 250;

/** A run is ingested once it stopped growing: its name is its start time (UTC, minutes). */
const settled = (run: string, now: Date) => {
  const started = Date.parse(`${run.slice(0, 10)}T${run.slice(11, 13)}:${run.slice(14, 16)}:00Z`);
  return Number.isFinite(started) && now.getTime() - started > 20 * 60_000;
};

// Personal data stays out of the base: YouTube descriptions often carry a contact email.
// Phone numbers are not stripped: their patterns collide with counts, prices and dates.
const EMAIL = /[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const scrub = (text: string) => text.replace(EMAIL, '[email]');

export function itemRow(raw: RawItem, seenAt: string) {
  const engagement = engagementOf(raw.metrics, raw.platform);
  return {
    id: `${raw.platform}:${raw.externalId}`,
    platform: raw.platform,
    source: raw.source,
    externalId: raw.externalId,
    url: raw.url,
    authorId: raw.author.id,
    authorName: raw.author.name || raw.author.handle || raw.author.id,
    authorHandle: raw.author.handle ?? null,
    authorFollowers: raw.author.followers ?? null,
    publishedAt: raw.publishedAt,
    publishedApprox: raw.publishedApprox ?? false,
    title: raw.title == null ? null : scrub(raw.title),
    text: scrub(raw.text ?? ''),
    format: raw.format,
    lang: raw.lang ?? null,
    // Instagram reports fractional seconds (384.833); the column is whole seconds.
    durationSec: raw.durationSec == null ? null : Math.round(raw.durationSec),
    query: raw.query ?? null,
    views: raw.metrics.views ?? null,
    likes: raw.metrics.likes ?? null,
    comments: raw.metrics.comments ?? null,
    shares: raw.metrics.shares ?? null,
    saves: raw.metrics.saves ?? null,
    engagement,
    reference: isReference(raw.platform, raw.author),
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

/** Upserts pieces and appends a metrics snapshot per piece. Returns how many were written. */
export async function saveItems(deps: Deps, raws: RawItem[], viaSensor = false): Promise<number> {
  for (let i = 0; i < raws.length; i += CHUNK) {
    const chunk = raws.slice(i, i + CHUNK);
    const rows = chunk.map((r) => ({ ...itemRow(r, r.capturedAt), viaSensor }));
    await deps.db
      .insert(items)
      .values(rows)
      .onConflictDoUpdate({
        target: items.id,
        set: {
          url: sql`excluded.url`,
          authorName: sql`excluded.author_name`,
          authorFollowers: sql`coalesce(excluded.author_followers, ${items.authorFollowers})`,
          title: sql`coalesce(excluded.title, ${items.title})`,
          text: sql`case when length(excluded.text) > length(${items.text}) then excluded.text else ${items.text} end`,
          views: sql`coalesce(excluded.views, ${items.views})`,
          likes: sql`coalesce(excluded.likes, ${items.likes})`,
          comments: sql`coalesce(excluded.comments, ${items.comments})`,
          shares: sql`coalesce(excluded.shares, ${items.shares})`,
          saves: sql`coalesce(excluded.saves, ${items.saves})`,
          engagement: sql`greatest(excluded.engagement, ${items.engagement})`,
          // An exact date beats a "hace 2 días" read at an earlier capture.
          publishedAt: sql`case when ${items.publishedApprox} and not excluded.published_approx then excluded.published_at else ${items.publishedAt} end`,
          publishedApprox: sql`${items.publishedApprox} and excluded.published_approx`,
          viaSensor: sql`${items.viaSensor} or excluded.via_sensor`,
          // Vigía and the sensor read pieces on demand: they must not move the capture's end,
          // which is where the radar's week ends (asOfOf).
          lastSeenAt: sql`case when excluded.via_sensor or excluded.query like 'vigia:%' then ${items.lastSeenAt} else greatest(excluded.last_seen_at, ${items.lastSeenAt}) end`,
        },
      });
    await deps.db
      .insert(itemMetrics)
      .values(
        rows.map((r) => ({
          itemId: r.id,
          capturedAt: r.lastSeenAt,
          views: r.views,
          likes: r.likes,
          comments: r.comments,
          shares: r.shares,
          saves: r.saves,
          engagement: r.engagement,
        })),
      )
      .onConflictDoNothing();
  }
  return raws.length;
}

/** Ingests every settled capture run not ingested before. */
export async function ingestRuns(
  deps: Deps,
  options: { force?: boolean } = {},
): Promise<{ runs: string[]; items: number }> {
  const done = new Set(
    (await deps.db.select({ stats: runs.stats }).from(runs).where(eq(runs.kind, 'ingest'))).map(
      (r) => String(r.stats.run),
    ),
  );
  const now = deps.clock.now();
  const todo = (await listRuns(deps.config.RAW_DIR)).filter((dir) => {
    const run = basename(dir);
    return !done.has(run) && (options.force || settled(run, now));
  });
  let total = 0;
  for (const dir of todo) {
    const run = basename(dir);
    const startedAt = deps.clock.now().toISOString();
    const parsed = (await parseRun(dir)).filter(
      // Shorts found by search come without a channel: they cannot count as anyone's voice.
      (p) => p.author.id !== '',
    );
    const written = await saveItems(deps, parsed);
    total += written;
    const byPlatform: Record<string, number> = {};
    for (const p of parsed) byPlatform[p.platform] = (byPlatform[p.platform] ?? 0) + 1;
    await deps.db.insert(runs).values({
      id: newId('run'),
      kind: 'ingest',
      startedAt,
      finishedAt: deps.clock.now().toISOString(),
      stats: { run, items: written, byPlatform },
    });
  }
  return { runs: todo.map((d) => basename(d)), items: total };
}
