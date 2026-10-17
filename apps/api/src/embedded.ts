/**
 * The API as a library, for a host that serves it in-process (the single Vercel deployment: the
 * web's route handler). The database is PGlite in memory and the demo is reset on creation, so
 * every instance starts at October 1. Locally and in Docker the API runs as its own server
 * (index.ts) instead.
 *
 * A serverless platform may send consecutive requests of one visitor to different instances, each
 * with its own memory. So the visitor carries the tour: a cookie lists the tour actions taken since
 * their last reset. An instance behind the visitor replays forward only the actions it lacks (the
 * October arrival without pauses); ids are sequential from each reset, so the replay assigns the
 * same ids and open links keep working. An instance never rewinds for a cookie (only an explicit
 * POST /demo/reset does): when the cookie diverges from what the instance has, or a replay stops
 * early, the instance keeps its state and rewrites the cookie to it, so the visitor converges.
 * What a visitor does outside the tour (an upload, a person's decision) lives only in the
 * instance that received it.
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
  // ponytail: every request of an instance runs one at a time, so nobody reads a half-replayed
  // state; visitors sharing an instance share its demo (fine for a jury demo)
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  /** Applies the actions the visitor took that this instance lacks; never rewinds. */
  async function forward(carried: string[]): Promise<void> {
    if (!demo || carried.length <= taken.length) return;
    if (!taken.every((action, i) => carried[i] === action)) return;
    const missing = carried.slice(taken.length);
    if (!missing.every((a) => ACTIONS.includes(a))) return;
    console.info(`Demo: replaying ${missing.join(', ')} on this instance.`);
    const pace = demo.paceMs;
    demo.paceMs = 0;
    try {
      for (const action of missing) {
        await demo.idle();
        await demo.act(action as TourAction);
        await demo.idle();
        taken.push(action as TourAction);
      }
    } catch (error) {
      // a tour the demo cannot take (an edited cookie): keep the state reached so far
      console.warn(`Demo: replay stopped: ${String(error)}`);
    } finally {
      demo.paceMs = pace;
    }
  }

  async function respond(request: Request, carried: string[] | null): Promise<Response> {
    await forward(carried ?? []);
    const path = new URL(request.url).pathname;
    const action = request.method === 'POST' ? ACTION.exec(path)?.[1] : undefined;
    const reset = request.method === 'POST' && path === '/api/v1/demo/reset';
    const response = await app.fetch(request);
    const wrote = (reset || action !== undefined) && response.ok;
    if (wrote) taken = reset ? [] : [...taken, action as TourAction];
    const value = taken.join('.') || '-';
    // the visitor already carries what this instance has (or carries nothing yet)
    if (!wrote && (carried === null || (carried.join('.') || '-') === value)) return response;
    const headers = new Headers(response.headers);
    const secure = request.url.startsWith('https:') ? '; Secure' : '';
    headers.append(
      'set-cookie',
      `${COOKIE}=${value}; Path=/; SameSite=Lax; HttpOnly; Max-Age=86400${secure}`,
    );
    return new Response(response.body, { status: response.status, headers });
  }

  async function handle(request: Request): Promise<Response> {
    if (!demo) return app.fetch(request);
    const carried = readTour(request.headers.get('cookie'));
    return serial(() => respond(request, carried));
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

/**
 * The tour the visitor carries: null without the cookie (no reset or action yet). An edited value
 * comes back as is: it is not a prefix of anything the instance has, so the cookie is rewritten.
 */
function readTour(cookie: string | null): string[] | null {
  const value = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (value === undefined) return null;
  if (value === '-') return [];
  const actions = value.split('.');
  // never replay something the tour cannot take
  return actions.every((a) => ACTIONS.includes(a)) && actions.length <= ACTIONS.length
    ? actions
    : [value];
}
