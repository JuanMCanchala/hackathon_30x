/**
 * The API served in-process, for the single Vercel deployment (built without API_URL). Locally
 * and in Docker, next.config rewrites these paths to the separate API instead, so this module
 * never loads there. One API per function instance: PGlite in memory, the demo reset to
 * October 1 on the first request; its in-process locks serialize the demo within the instance,
 * and the visitor's tour cookie brings a new instance to the same step (see createEmbeddedApi).
 */
import { join } from 'node:path';
import { after } from 'next/server';
import { createEmbeddedApi } from '@recibido/api/embedded';

// The bundle cannot locate the migrations and the dataset next to itself; next.config traces
// both into the function, at the same paths relative to this app as in the repository.
process.env.MIGRATIONS_DIR ??= join(process.cwd(), '../api/drizzle');
process.env.DATASET_DIR ??= join(process.cwd(), '../../packages/dataset');

let instance: ReturnType<typeof createEmbeddedApi> | null = null;

function embedded() {
  instance ??= createEmbeddedApi().catch((error: unknown) => {
    instance = null;
    throw error;
  });
  return instance;
}

export async function handle(request: Request): Promise<Response> {
  const api = await embedded();
  const response = await api.handle(request);
  // keep the instance alive until a background demo action (the October arrival) finishes
  after(() => api.idle());
  return response;
}
