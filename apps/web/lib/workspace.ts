'use client';

/**
 * The team's workspace as this browser keeps it: the company profile («Mi empresa») and what the
 * team decided about each topic in «Elegir». There is no server store for either yet, so both
 * live in localStorage and every screen says so where it matters.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface CompanyProfile {
  name: string;
  site: string;
  industry: string;
  topic: string;
  about: string;
  audience: string[];
  pillars: string[];
  voice: string[];
  avoid: string[];
  example: string;
  references: { handle: string; where: string }[];
  watchLangs: string[];
  publishLangs: string[];
  markets: string[];
}

/** 30X as the radar already reads it (the fit rubric and the voice on the server). */
export const DEFAULT_PROFILE: CompanyProfile = {
  name: '30X',
  site: '30x.com',
  industry: 'Educación ejecutiva y negocios',
  topic: 'IA para negocios',
  about:
    'Comunidad y programas para CEOs y líderes de LatAm que quieren crecer sus empresas con mejores prácticas e IA.',
  audience: ['CEOs y fundadores', 'Líderes de ventas', 'Pymes en LatAm'],
  pillars: ['Ventas', 'Liderazgo', 'IA aplicada', 'Crecimiento'],
  voice: ['Directa', 'Cercana', 'Con datos', 'Inspira'],
  avoid: ['Jerga técnica', 'Promesas absolutas', 'Clickbait'],
  example: '',
  references: [
    { handle: '@crece30x', where: 'LinkedIn · cuenta propia' },
    { handle: '@andresbilbao', where: 'Instagram · fundador' },
  ],
  watchLangs: ['Inglés', 'Portugués'],
  publishLangs: ['Español'],
  markets: ['Colombia', 'México', 'Chile'],
};

export type Decision = 'sirve' | 'no' | 'despues';

const PROFILE_KEY = 'ondai:profile';
const DECISIONS_KEY = 'ondai:decisions';
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // storage blocked: the defaults hold for this page
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  if (raw) {
    try {
      value = { ...fallback, ...(JSON.parse(raw) as T) };
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the change lasts until reload
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

export function useProfile(): [CompanyProfile, (next: CompanyProfile) => void] {
  const profile = useSyncExternalStore(
    subscribe,
    () => read(PROFILE_KEY, DEFAULT_PROFILE),
    () => DEFAULT_PROFILE,
  );
  const save = useCallback((next: CompanyProfile) => write(PROFILE_KEY, next), []);
  return [profile, save];
}

const NO_DECISIONS: Record<string, Decision> = {};

export function useDecisions(): [
  Record<string, Decision>,
  (topicId: string, decision: Decision | null) => void,
] {
  const decisions = useSyncExternalStore(
    subscribe,
    () => read<Record<string, Decision>>(DECISIONS_KEY, NO_DECISIONS),
    () => NO_DECISIONS,
  );
  const decide = useCallback((topicId: string, decision: Decision | null) => {
    const next = { ...read<Record<string, Decision>>(DECISIONS_KEY, NO_DECISIONS) };
    if (decision) next[topicId] = decision;
    else delete next[topicId];
    write(DECISIONS_KEY, next);
  }, []);
  return [decisions, decide];
}
