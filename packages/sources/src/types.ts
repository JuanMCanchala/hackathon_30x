import type { RawItem } from '@radar/core';

/** One line of `data/raw/<run>/index.jsonl`, written by `scripts/capture.mjs`. */
export interface CaptureRecord {
  /** The capture group: youtube, bluesky, news, hn, github, huggingface, arxiv, newsletters, x, instagram, linkedin. */
  source: string;
  key: string;
  url: string;
  status: number;
  bytes: number;
  /** Relative to the run directory; null when the request failed. */
  file: string | null;
  capturedAt: string;
  meta: Record<string, unknown>;
}

/** Turns one raw response into pieces. Pure: no network, no clock. */
export type Parser = (body: string, record: CaptureRecord) => RawItem[];
