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
import { radar, scoreTopics } from './radar';
import { fitForTopic, topicDetail } from './topic';

/** Runs `fn` over `items`, `limit` at a time. */
async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item).catch((error) => console.error('warm:', (error as Error).message));
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

/**
 * Prepares what a person sees first: the fit of the 60 topics growing the most (so the audience
 * filter works from the first visit), then the "why" of the top 10 of every network filter.
 */
export async function warmTopics(deps: Deps): Promise<number> {
  const { asOf, scored } = await scoreTopics(deps);
  const ranked = scored
    .filter((s) => s.core.momentum > 0 && s.meta.named && !s.meta.generic)
    .slice(0, 60);
  // Topics already viral in English or Portuguese need their fit too: they fill the Spanish window.
  const windows = scored
    .filter((s) => s.spanishWindow.open && s.meta.named && !s.meta.generic)
    .slice(0, 40);
  const toFit = [...new Map([...ranked, ...windows].map((s) => [s.core.id, s])).values()];
  await inParallel(toFit, 6, (s) => fitForTopic(deps, s.core.id, asOf));
  const seen = new Set<string>();
  for (const audience of ['30x', 'all'] as const) {
    for (const platform of ['all', 'linkedin', 'instagram', 'youtube', 'x'] as const) {
      const week = await radar(deps, { platform, region: 'global', untouched: false, audience });
      for (const t of [...week.topics, ...week.forming, ...week.windowsOpen]) seen.add(t.id);
    }
  }
  await inParallel([...seen], 3, (id) => topicDetail(deps, id));
  return seen.size;
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
  options: { enrich?: boolean; limit?: number; rebuild?: boolean; force?: boolean } = {},
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
      const ingested = await ingestRuns(deps, { force: options.force });
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
