import { loadConfig } from '../src/config';
import { createContainer, type Container } from '../src/container';
import { GroundTruthExtractor } from '../src/extraction/truth';
import type { Extractor } from '../src/extraction/types';
import type { Clock } from '../src/lib/common';
import { resetDemo } from '../src/services/demo';

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(iso: string) {
    this.current = new Date(iso);
  }
}

let truth: GroundTruthExtractor | null = null;
export function groundTruth(): GroundTruthExtractor {
  truth ??= new GroundTruthExtractor();
  return truth;
}

export async function demoContainer(
  options: { extractor?: Extractor; now?: string } = {},
): Promise<Container & { clock: FixedClock }> {
  const config = loadConfig({
    ...process.env,
    DEMO_MODE: 'true',
    DEMO_PACE_MS: '0',
    ANTHROPIC_API_KEY: '',
    FIREWORKS_API_KEY: '',
    PUBLIC_WEB_URL: 'http://localhost:3000',
  } as NodeJS.ProcessEnv);
  const clock = new FixedClock(new Date(options.now ?? '2026-10-16T15:00:00Z'));
  const container = await createContainer(
    { ...config, ANTHROPIC_API_KEY: undefined },
    { ephemeral: true, extractor: options.extractor ?? groundTruth(), clock },
  );
  await resetDemo(container.deps);
  return { ...container, clock };
}
