/**
 * One fetch each to the sources that cloud IPs get throttled on, with a one-line verdict per
 * source. Run it once on the host after a deploy:
 *
 *   pnpm --filter @radar/sources exec tsx scripts/check-sources.ts
 */
import { httpFetch, INSTAGRAM_APP_ID, INSTAGRAM_APP_UA, runSearch, searchRequests } from '../src';

interface Check {
  name: string;
  run: () => Promise<{ status: number; verdict: string }>;
}

const json = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

const throttled = (status: number) =>
  status === 429
    ? 'limitado (429)'
    : status === 401 || status === 403
      ? `bloqueado (${status})`
      : `falló (${status})`;

const [youtube, bluesky] = (() => {
  const requests = searchRequests('AI agents', 'en', new Date(), 168);
  return [
    requests.find((r) => r.source === 'youtube')!,
    requests.find((r) => r.source === 'bluesky')!,
  ];
})();

const checks: Check[] = [
  {
    name: 'instagram web_profile_info',
    run: async () => {
      const res = await httpFetch(
        'https://i.instagram.com/api/v1/users/web_profile_info/?username=crece30x',
        { headers: { 'user-agent': INSTAGRAM_APP_UA, 'x-ig-app-id': INSTAGRAM_APP_ID } },
      );
      const data = json(res.body) as
        { data?: { user?: { edge_owner_to_timeline_media?: { edges?: unknown[] } } } } | undefined;
      const posts = data?.data?.user?.edge_owner_to_timeline_media?.edges?.length;
      if (res.status === 200 && posts !== undefined)
        return { status: res.status, verdict: `ok, ${posts} posts` };
      if (res.status === 200 || res.url.includes('/login'))
        return { status: res.status, verdict: 'pide login: sin datos' };
      return { status: res.status, verdict: throttled(res.status) };
    },
  },
  {
    name: 'bluesky searchPosts',
    run: async () => {
      const r = await runSearch(httpFetch, bluesky, new Date().toISOString());
      if (r.status !== 200) return { status: r.status, verdict: throttled(r.status) };
      return { status: r.status, verdict: `ok, ${r.items.length} posts` };
    },
  },
  {
    name: 'youtube results',
    run: async () => {
      const r = await runSearch(httpFetch, youtube, new Date().toISOString());
      if (r.status !== 200) return { status: r.status, verdict: throttled(r.status) };
      // A 200 with no videos is the consent wall or a page the parser no longer understands.
      return {
        status: r.status,
        verdict:
          r.items.length > 0
            ? `ok, ${r.items.length} videos`
            : '200 sin videos: consentimiento o parser roto',
      };
    },
  },
  {
    name: 'gdelt timelinelang',
    run: async () => {
      const res = await httpFetch(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=deepseek&mode=timelinelang&format=json&timespan=1w',
      );
      const data = json(res.body) as { timeline?: { series?: string }[] } | undefined;
      if (res.status === 200 && data?.timeline)
        return { status: res.status, verdict: `ok, ${data.timeline.length} idiomas` };
      if (res.status === 200)
        return { status: res.status, verdict: '200 sin JSON: ' + res.body.slice(0, 60) };
      return { status: res.status, verdict: throttled(res.status) };
    },
  },
];

for (const check of checks) {
  const start = performance.now();
  let line: string;
  try {
    const { status, verdict } = await check.run();
    line = `${status}  ${verdict}`;
  } catch (error) {
    line = `---  error de red: ${(error as Error).message}`;
  }
  const ms = Math.round(performance.now() - start);
  console.log(`${check.name.padEnd(28)} ${String(ms).padStart(6)} ms  ${line}`);
}
