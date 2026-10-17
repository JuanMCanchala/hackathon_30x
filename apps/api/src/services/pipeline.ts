/**
 * Runs the pipeline inside the API process (the embedded database allows one process): new
 * captures in, new pieces read, labels clustered, new topics named. One run at a time; progress
 * goes out as events so the web can show it.
 */
import { analyses, topics } from '../db/schema';
import { clusterLabels, nameTopics } from '../pipeline/cluster';
import { enrichPending } from '../pipeline/enrich';
import { ingestRuns } from '../pipeline/ingest';
import type { Deps } from './deps';
import { radar } from './radar';
import { topicDetail } from './topic';

/**
 * Writes the "why" and the fit of every topic a person is likely to open first: the top 10 of
 * each network filter, so the radar's table shows its reasons without waiting.
 */
export async function warmTopics(deps: Deps): Promise<number> {
  const seen = new Set<string>();
  for (const platform of ['all', 'linkedin', 'instagram', 'youtube', 'x'] as const) {
    const week = await radar(deps, { platform, region: 'global', untouched: false });
    for (const t of [...week.topics, ...week.forming]) seen.add(t.id);
  }
  let warmed = 0;
  for (const id of seen) {
    try {
      await topicDetail(deps, id);
      warmed += 1;
    } catch (error) {
      console.error(`warm ${id}:`, (error as Error).message);
    }
  }
  return warmed;
}

export interface PipelineStatus {
  running: boolean;
  step: string | null;
  /** Pieces read so far in the current run, and how many it has to read. */
  progress: { done: number; total: number } | null;
  startedAt: string | null;
  finishedAt: string | null;
  last: Record<string, unknown> | null;
  error: string | null;
}

const status: PipelineStatus = {
  running: false,
  step: null,
  progress: null,
  startedAt: null,
  finishedAt: null,
  last: null,
  error: null,
};

export const pipelineStatus = (): PipelineStatus => ({ ...status });

export function startPipeline(
  deps: Deps,
  options: { enrich?: boolean; limit?: number; rebuild?: boolean } = {},
): PipelineStatus {
  if (status.running) return pipelineStatus();
  Object.assign(status, {
    running: true,
    step: 'ingesta',
    startedAt: deps.clock.now().toISOString(),
    error: null,
  });
  const progress = (step: string, data: Record<string, unknown> = {}) => {
    status.step = step;
    deps.bus.publish({
      type: 'pipeline.progress',
      at: deps.clock.now().toISOString(),
      data: { step, ...data },
    });
  };
  void (async () => {
    try {
      progress('ingesta');
      const ingested = await ingestRuns(deps);
      let enriched = { read: 0, failed: 0 };
      if (options.enrich !== false) {
        progress('lectura');
        enriched = await enrichPending(deps, {
          limit: options.limit ?? 5000,
          onProgress: (done, total) => {
            status.progress = { done, total };
            progress('lectura', { done, total });
          },
        });
      }
      progress('temas');
      if (options.rebuild) {
        // Topics are rebuilt from the labels; links, series and adaptations go with them.
        await deps.db.delete(analyses);
        await deps.db.delete(topics);
      }
      const clustered = await clusterLabels(deps);
      progress('nombres');
      const named = await nameTopics(deps);
      progress('explicaciones');
      const warmed = await warmTopics(deps);
      status.last = {
        runs: ingested.runs.length,
        pieces: ingested.items,
        ...enriched,
        ...clustered,
        named,
        warmed,
      };
      deps.bus.publish({
        type: 'pipeline.done',
        at: deps.clock.now().toISOString(),
        data: status.last,
      });
    } catch (error) {
      status.error = (error as Error).message;
      console.error('pipeline:', error);
    } finally {
      status.running = false;
      status.step = null;
      status.progress = null;
      status.finishedAt = deps.clock.now().toISOString();
    }
  })();
  return pipelineStatus();
}
