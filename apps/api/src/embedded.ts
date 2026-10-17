/**
 * The API as a library, for a host that serves it in-process (the single Vercel deployment: the
 * web's route handler). The database is PGlite in memory and the demo is reset on creation, so
 * every instance starts at October 1. Locally and in Docker the API runs as its own server
 * (index.ts) instead.
 *
 * A serverless platform may send consecutive requests of one visitor to different instances, each
 * with its own memory. So the visitor carries the tour: a cookie lists the tour actions taken since
 * their last reset, and an instance whose state differs replays them first (reset, then each
 * action, the October arrival without pauses). Ids are sequential from each reset, so the replay
 * assigns the same ids and open links keep working. What a visitor does outside the tour (an
 * upload, a person's decision) lives only in the instance that received it.
 */
import { loadConfig } from './config';
import { createContainer } from './container';
import { openDatabase } from './db/client';
import { createApp } from './http/app';
import { DemoService, type TourAction } from './services/demo';
import { useSequentialIds } from './services/state';

const COOKIE = 'recibido-tour';
const ACTION = /^\/api\/v1\/demo\/actions\/([a-z-]+)$/;

export async function createEmbeddedApi(env: NodeJS.ProcessEnv = process.env) {
  useSequentialIds();
  const config = loadConfig(env);
  const database = await openDatabase({});
  const c = await createContainer(config, { db: database.db });
  const demo = config.demoMode ? new DemoService(c) : null;
  if (demo) await demo.reset();
  else await c.seed();
  const app = createApp(c, demo);

  /** the tour actions this instance has taken since its last reset */
  let taken: TourAction[] = [];
  // ponytail: one replay at a time per instance; visitors on different tour steps sharing an
  // instance replay on each switch (seconds each), fine for a jury demo
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  async function replay(target: TourAction[]): Promise<void> {
    if (!demo || target.join() === taken.join()) return;
    console.info(`Demo: replaying the tour (${target.join(', ') || 'reset'}) on this instance.`);
    await demo.reset();
    taken = [];
    const pace = demo.paceMs;
    demo.paceMs = 0;
    try {
      for (const action of target) {
        await demo.act(action);
        await demo.idle();
        taken.push(action);
      }
    } catch (error) {
      // a tour the demo cannot take (an edited cookie): serve the state reached so far
      console.warn(`Demo: replay stopped: ${String(error)}`);
    } finally {
      demo.paceMs = pace;
    }
  }

  async function handle(request: Request): Promise<Response> {
    if (!demo) return app.fetch(request);
    const path = new URL(request.url).pathname;
    const carried = readTour(request.headers.get('cookie'));
    if (carried) await serial(() => replay(carried));
    if (request.method !== 'POST') return app.fetch(request);

    const action = ACTION.exec(path)?.[1] as TourAction | undefined;
    const reset = path === '/api/v1/demo/reset';
    if (!reset && !action) return app.fetch(request);
    // tour writes run one at a time with the replays, so `taken` follows the database
    return serial(async () => {
      const response = await app.fetch(request);
      if (response.ok) {
        taken = reset ? [] : [...taken, action!];
        const headers = new Headers(response.headers);
        const secure = request.url.startsWith('https:') ? '; Secure' : '';
        headers.append(
          'set-cookie',
          `${COOKIE}=${taken.join('.') || '-'}; Path=/; SameSite=Lax; HttpOnly; Max-Age=86400${secure}`,
        );
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    });
  }

  return {
    handle,
    /** resolves once a background demo action (the October arrival) has finished */
    idle: () => demo?.idle() ?? Promise.resolve(),
  };
}

const ACTIONS: readonly string[] = [
  'arrive-october',
  'reply-daniela',
  'accept-brand-kit',
  'merge-pr',
  'close-october',
] satisfies TourAction[];

/** The tour the visitor carries: null without the cookie (no reset or action yet). */
function readTour(cookie: string | null): TourAction[] | null {
  const value = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (value === undefined) return null;
  if (value === '-') return [];
  const actions = value.split('.');
  // an unknown value counts as no cookie: never replay something the tour cannot take
  return actions.every((a) => ACTIONS.includes(a)) && actions.length <= ACTIONS.length
    ? (actions as TourAction[])
    : null;
}
