'use client';

/**
 * What the team decided about each post a caught piece turned into («Sirve», «No sirve», «Para
 * después») and which of them it already put on the calendar. Like Elegir's decisions, they live
 * in this browser: one localStorage entry per piece, stamped with the adaptation they were made
 * on, so a rewritten adaptation starts with a clean deck.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { Decision } from './workspace';

export interface ScheduledPost {
  /** YYYY-MM-DD. */
  date: string;
  /** 'HH:MM' or null when no hour was picked. */
  time: string | null;
}

export interface PostDecisions {
  /** The adaptation these decisions were made on (see `stampOf`). */
  stamp: string;
  decisions: Record<string, Decision>;
  scheduled: Record<string, ScheduledPost>;
}

const EMPTY: PostDecisions = { stamp: '', decisions: {}, scheduled: {} };
const DECISIONS = new Set<string>(['sirve', 'no', 'despues']);

export const postDecisionsKey = (watchId: string, itemId: string) =>
  `ondai:vigia:${watchId}:${itemId}`;

/** A short fingerprint of an adaptation's text, so decisions follow the version they judged. */
export function stampOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: PostDecisions }>();
/** Writes that storage refused (private mode, quota): they last until the page reloads. */
const memory = new Map<string, string>();

function rawOf(key: string): string | null {
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Only what this module writes survives the read: the store is the browser's, not ours. */
function parse(raw: string): PostDecisions {
  const data = JSON.parse(raw) as Partial<Record<keyof PostDecisions, unknown>>;
  const decisions: Record<string, Decision> = {};
  if (data.decisions && typeof data.decisions === 'object')
    for (const [id, d] of Object.entries(data.decisions))
      if (typeof d === 'string' && DECISIONS.has(d)) decisions[id] = d as Decision;
  const scheduled: Record<string, ScheduledPost> = {};
  if (data.scheduled && typeof data.scheduled === 'object')
    for (const [id, s] of Object.entries(data.scheduled)) {
      const v = s as Partial<ScheduledPost> | null;
      if (v && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date))
        scheduled[id] = {
          date: v.date,
          time: typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) ? v.time : null,
        };
    }
  return { stamp: typeof data.stamp === 'string' ? data.stamp : '', decisions, scheduled };
}

function read(key: string): PostDecisions {
  const raw = rawOf(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  if (raw) {
    try {
      value = parse(raw);
    } catch {
      value = EMPTY;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: PostDecisions) {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    memory.set(key, raw);
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The decisions on one caught piece's posts. `stamp` names the adaptation on screen: decisions
 * stored for another version read as none.
 */
export function usePostDecisions(watchId: string, itemId: string, stamp: string) {
  const key = postDecisionsKey(watchId, itemId);
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const current = stored.stamp === stamp ? stored : EMPTY;

  const update = useCallback(
    (change: (prev: PostDecisions) => PostDecisions) => {
      const prev = read(key);
      write(key, change(prev.stamp === stamp ? prev : { ...EMPTY, stamp }));
    },
    [key, stamp],
  );

  const decide = useCallback(
    (cardId: string, decision: Decision | null) =>
      update((p) => {
        const decisions = { ...p.decisions };
        if (decision) decisions[cardId] = decision;
        else delete decisions[cardId];
        return { ...p, decisions };
      }),
    [update],
  );

  /** Back to the deck: every card, or only those with one decision («Repasar los de después»). */
  const reset = useCallback(
    (only?: Decision) =>
      update((p) => ({
        ...p,
        decisions: only
          ? Object.fromEntries(Object.entries(p.decisions).filter(([, d]) => d !== only))
          : {},
      })),
    [update],
  );

  const markScheduled = useCallback(
    (cardId: string, when: ScheduledPost) =>
      update((p) => ({ ...p, scheduled: { ...p.scheduled, [cardId]: when } })),
    [update],
  );

  return {
    decisions: current.decisions,
    scheduled: current.scheduled,
    decide,
    reset,
    markScheduled,
  };
}
