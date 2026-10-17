/**
 * The reference profiles 30X shared with the challenge: its own accounts and Andrés Bilbao's.
 * Their pieces are measured against their own median and tell which topics 30X already covered.
 */
import type { Author, Platform } from '@radar/core';

export interface ReferenceProfile {
  platform: Platform;
  /** Matched against the author's id, handle or name, case-insensitive. */
  ids: string[];
  name: string;
  /** Who the profile is, in one line, for the screen. */
  role: string;
  url: string;
}

export const REFERENCES: ReferenceProfile[] = [
  {
    platform: 'instagram',
    ids: ['andresbilbao'],
    name: 'Andrés Bilbao',
    role: 'Cofundador de Rappi y de 30X',
    url: 'https://www.instagram.com/andresbilbao/',
  },
  {
    platform: 'instagram',
    ids: ['crece30x'],
    name: '30X',
    role: 'Educación ejecutiva para LatAm',
    url: 'https://www.instagram.com/crece30x/',
  },
  {
    platform: 'linkedin',
    ids: ['crece30x', '30x'],
    name: '30X',
    role: 'Educación ejecutiva para LatAm',
    url: 'https://www.linkedin.com/company/crece30x/',
  },
];

export function referenceOf(platform: string, author: Pick<Author, 'id' | 'handle' | 'name'>) {
  const keys = [author.id, author.handle, author.name]
    .filter((k): k is string => Boolean(k))
    .map((k) => k.toLowerCase().replace(/^@/, ''));
  return (
    REFERENCES.find((r) => r.platform === platform && r.ids.some((id) => keys.includes(id))) ?? null
  );
}

export const isReference = (platform: string, author: Pick<Author, 'id' | 'handle' | 'name'>) =>
  referenceOf(platform, author) !== null;
