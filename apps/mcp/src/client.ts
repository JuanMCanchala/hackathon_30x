/** Thin HTTP client for the OndAI API. */

export class RadarError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RadarClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class RadarClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RadarClientOptions) {
    this.fetcher = options.fetch ?? fetch;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!response.ok) {
      throw new RadarError(
        response.status,
        body.error?.message ?? `OndAI respondió ${response.status}`,
      );
    }
    return body;
  }

  radar(params: { platform?: string; region?: string; untouched?: boolean; everything?: boolean }) {
    const q = new URLSearchParams({
      platform: params.platform ?? 'all',
      region: params.region ?? 'global',
      audience: params.everything ? 'all' : '30x',
      ...(params.untouched ? { untouched: '1' } : {}),
    });
    return this.call<RadarWeek>(`/api/v1/radar?${q}`);
  }

  topic(id: string) {
    return this.call<TopicDetail>(`/api/v1/topics/${encodeURIComponent(id)}`);
  }

  adapt(id: string, variant = 0) {
    return this.call<Adaptation>(`/api/v1/topics/${encodeURIComponent(id)}/adaptations`, {
      method: 'POST',
      body: JSON.stringify({ variant }),
    });
  }

  ask(question: string) {
    return this.call<{
      answer: string;
      refs: { ref: string; label: string }[];
      followUps: string[];
    }>('/api/v1/ask', { method: 'POST', body: JSON.stringify({ question }) });
  }

  send(url: string, submittedBy: string) {
    return this.call<{ title: string; topics: { id: string; name: string }[] }>('/api/v1/sensor', {
      method: 'POST',
      body: JSON.stringify({ url, submittedBy }),
    });
  }
}

export interface RadarTopic {
  id: string;
  rank: number;
  name: string;
  stage: string;
  timing: string;
  growthPct: number;
  creators: number;
  platforms: string[];
  fit: number | null;
  why: string | null;
  fresh?: boolean;
}

export interface RadarWeek {
  headline: string;
  week: { start: string; end: string };
  topics: RadarTopic[];
  forming: RadarTopic[];
}

export interface TopicDetail {
  topic: RadarTopic & { definition: string | null };
  why: { patterns: { label: string }[]; narrative: string | null };
  fit: { score: number; pillar: string; reasons: string[] } | null;
  evidence: {
    platform: string;
    authorName: string;
    url: string;
    hook: string | null;
    title: string | null;
    text: string;
    outlier: number | null;
  }[];
}

export interface Adaptation {
  angle: string;
  hooks: string[];
  linkedin: string;
  reel: { hook: string; beats: string[]; cta: string };
  youtube: { title: string; thumbnail: string };
}
