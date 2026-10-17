import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fetcher, HttpRequest } from '../src/http';
import type { CaptureRecord } from '../src/types';

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

export const CAPTURED_AT = '2026-10-17T16:58:10.000Z';

export function record(
  source: string,
  meta: Record<string, unknown> = {},
  key = 'k',
): CaptureRecord {
  return {
    source,
    key,
    url: `https://example.test/${source}/${key}`,
    status: 200,
    bytes: 0,
    file: `${source}/${key}.gz`,
    capturedAt: CAPTURED_AT,
    meta,
  };
}

/** A fetcher that answers from a table of URL patterns and records every call. */
export function fakeFetcher(routes: [RegExp, number, string][]): Fetcher & {
  calls: { url: string; init?: HttpRequest }[];
} {
  const calls: { url: string; init?: HttpRequest }[] = [];
  const fetcher = (async (url: string, init?: HttpRequest) => {
    calls.push({ url, init });
    const route = routes.find(([re]) => re.test(url));
    if (!route) return { status: 404, url, body: '' };
    return { status: route[1], url, body: route[2] };
  }) as Fetcher & { calls: typeof calls };
  fetcher.calls = calls;
  return fetcher;
}
