import { describe, expect, it } from 'vitest';
import type { RawItem } from '@radar/core';
import { itemRow } from '../src/pipeline/ingest';

const raw = (text: string, title?: string): RawItem => ({
  platform: 'youtube',
  source: 'youtube-search',
  externalId: 'v1',
  url: 'https://www.youtube.com/watch?v=v1',
  author: { id: 'c1', name: 'Canal' },
  publishedAt: '2026-10-16T12:00:00.000Z',
  title,
  text,
  format: 'video',
  metrics: { views: 10 },
  capturedAt: '2026-10-17T12:00:00.000Z',
});

describe('itemRow', () => {
  it('drops email addresses from the text and title of a piece', () => {
    const row = itemRow(
      raw(
        'Negocios: contacto@agencia.com.co o Juan.Perez+ia@mail.example.org. Sígueme en @juan.bsky.social',
        'Escríbeme a ventas@30x.com',
      ),
      '2026-10-17T12:00:00.000Z',
    );
    expect(row.text).toBe('Negocios: [email] o [email]. Sígueme en @juan.bsky.social');
    expect(row.title).toBe('Escríbeme a [email]');
  });
});
