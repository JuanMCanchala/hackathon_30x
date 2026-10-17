/**
 * Live GitHub evidence for milestones: the PRs that contracts name, by polling the REST API and
 * through a signed webhook. A merged PR becomes `pr_merged` evidence; the engine decides what it
 * pays. Anything unsigned, badly signed or about a PR no contract names changes nothing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EvidenceItem } from '@recibido/domain';
import type { Fetch } from '../llm/client';
import { addEvidence } from './evidence';
import { prEvidenceId } from './seed';
import { allContracts, allEvidence, type Deps } from './state';

export interface TrackedPr {
  vendorId: string;
  repo: string;
  number: number;
}

interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  created_at: string;
  user?: { login?: string } | null;
}

export interface GithubOptions {
  /** the repository polled live ("owner/name"); null polls nothing */
  repo: string | null;
  token?: string | null;
  webhookSecret?: string | null;
  fetch?: Fetch;
}

export type WebhookResult =
  | { accepted: true; changed: boolean }
  | { accepted: false; reason: 'no_secret' | 'bad_signature' | 'ignored_event' | 'untracked' };

export class GithubEvidence {
  private readonly fetch: Fetch;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly deps: Deps,
    private readonly options: GithubOptions,
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  /** Every PR a contract term requires as evidence. */
  async trackedPrs(): Promise<TrackedPr[]> {
    return (await allContracts(this.deps.db)).flatMap((c) =>
      c.terms.flatMap((t) =>
        t.evidence?.type === 'github_pr'
          ? [{ vendorId: c.vendorId, repo: t.evidence.repo, number: t.evidence.number }]
          : [],
      ),
    );
  }

  private async tracked(repo: string, number: number): Promise<TrackedPr | null> {
    const prs = await this.trackedPrs();
    return (
      prs.find((p) => p.repo.toLowerCase() === repo.toLowerCase() && p.number === number) ?? null
    );
  }

  private item(pr: TrackedPr, data: PullRequest, origin: EvidenceItem['origin']): EvidenceItem {
    const merged = data.merged_at !== null;
    return {
      id: prEvidenceId(pr.repo, pr.number),
      vendorId: pr.vendorId,
      source: 'github',
      origin,
      kind: merged ? 'pr_merged' : 'pr_open',
      ref: `${pr.repo}#${pr.number}`,
      title: data.title,
      url: data.html_url,
      occurredAt: data.merged_at ?? data.created_at,
      ...(data.user?.login ? { actor: data.user.login } : {}),
    };
  }

  /** Stores the item only when the PR's state changed (open → merged), then re-decides. */
  private async record(item: EvidenceItem): Promise<boolean> {
    const current = (await allEvidence(this.deps.db)).find((e) => e.id === item.id);
    if (current?.kind === item.kind) return false;
    await addEvidence(this.deps, [item]);
    return true;
  }

  /** One pass over the tracked PRs of the configured repository. */
  async poll(): Promise<number> {
    const repo = this.options.repo;
    if (!repo) return 0;
    let changed = 0;
    const prs = (await this.trackedPrs()).filter(
      (p) => p.repo.toLowerCase() === repo.toLowerCase(),
    );
    for (const pr of prs) {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'recibido',
      };
      if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;
      let response: Response;
      try {
        response = await this.fetch(`https://api.github.com/repos/${pr.repo}/pulls/${pr.number}`, {
          headers,
        });
      } catch (error) {
        console.warn(`GitHub ${pr.repo}#${pr.number}: ${(error as Error).message}`);
        continue;
      }
      if (!response.ok) {
        // 403/404/429 (rate limit, private repo, missing PR) leave the evidence as it was
        console.warn(`GitHub ${pr.repo}#${pr.number}: HTTP ${response.status}`);
        continue;
      }
      if (await this.record(this.item(pr, (await response.json()) as PullRequest, 'live')))
        changed++;
    }
    return changed;
  }

  startPolling(ms: number): () => void {
    this.stopPolling();
    this.timer = setInterval(() => {
      this.poll().catch((error: unknown) => console.warn(`GitHub poll: ${String(error)}`));
    }, ms);
    this.timer.unref();
    return () => this.stopPolling();
  }

  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** `X-Hub-Signature-256` is HMAC-SHA256 of the raw body with the webhook secret. */
  private signed(rawBody: string | Uint8Array, header: string | null | undefined): boolean {
    const secret = this.options.webhookSecret;
    if (!secret || !header?.startsWith('sha256=')) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
    const given = Buffer.from(header.slice('sha256='.length));
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  async handleWebhook(
    rawBody: string | Uint8Array,
    signatureHeader: string | null | undefined,
    eventHeader: string | null | undefined,
  ): Promise<WebhookResult> {
    if (!this.options.webhookSecret) return { accepted: false, reason: 'no_secret' };
    if (!this.signed(rawBody, signatureHeader)) return { accepted: false, reason: 'bad_signature' };
    if (eventHeader !== 'pull_request') return { accepted: false, reason: 'ignored_event' };
    let payload: { repository?: { full_name?: string }; pull_request?: PullRequest };
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString('utf8')) as typeof payload;
    } catch {
      return { accepted: false, reason: 'ignored_event' };
    }
    const repo = payload.repository?.full_name;
    const data = payload.pull_request;
    if (!repo || !data || !Number.isInteger(data.number))
      return { accepted: false, reason: 'ignored_event' };
    const pr = await this.tracked(repo, data.number);
    if (!pr) return { accepted: false, reason: 'untracked' };
    return { accepted: true, changed: await this.record(this.item(pr, data, 'live')) };
  }

  /** Demo without GitHub: the tracked PR `owner/repo#n` is merged now (labeled "simulado"). */
  async simulateMerge(prRef: string): Promise<boolean> {
    const m = /^(.+)#(\d+)$/.exec(prRef.trim());
    const pr = m ? await this.tracked(m[1]!, Number(m[2])) : null;
    if (!pr) return false;
    const current = (await allEvidence(this.deps.db)).find(
      (e) => e.id === prEvidenceId(pr.repo, pr.number),
    );
    const title = current?.title ?? `PR #${pr.number}`;
    return this.record({
      ...this.item(
        pr,
        {
          number: pr.number,
          title: `${title} (simulado)`,
          html_url: `https://github.com/${pr.repo}/pull/${pr.number}`,
          merged_at: await this.deps.clock.now(),
          created_at: await this.deps.clock.now(),
          user: current?.actor ? { login: current.actor } : null,
        },
        'fixture',
      ),
    });
  }
}
