/**
 * The guided demo: a one-click reset to October 1 (September already lived through the real
 * services) and the tour actions that walk the jury through October. Every action runs dataset
 * script steps through `runStep`, the same runner the eval uses, so the demo cannot drift from
 * what the eval measures.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  DEMO_START,
  filesDir,
  findBill,
  LIVE_PR,
  SCRIPT,
  SCRIPTED_EVIDENCE,
  type ScriptStep,
} from '@recibido/dataset';
import type { Container } from '../container';
import {
  bankLines,
  bills,
  contracts,
  decisions,
  documents,
  evidenceItems,
  humanActions,
  messages,
  orgState,
  payments,
  portalTokens,
  timeline,
  vendors,
} from '../db/schema';
import { withOrgLock } from './lock';
import { addStatementCardLine, executeDue } from './rail';
import { prEvidenceId } from './seed';
import { addTimeline, allEvidence, ORG_ID, REOPENED, ServiceError, type BillRow } from './state';

/** The October close: the last clock step, when the Blinka statement arrives. */
const OCTOBER_CLOSE = SCRIPT.octubre.findLast((s) => s.type === 'clock')!;

async function billOf(c: Container, datasetId: string): Promise<BillRow> {
  const [bill] = await c.db.select().from(bills).where(eq(bills.datasetId, datasetId));
  if (!bill) throw new ServiceError(409, `La cuenta ${datasetId} todavía no llegó.`);
  return bill;
}

function datasetFile(datasetId: string) {
  const spec = findBill(datasetId);
  return { bytes: readFileSync(join(filesDir(), spec.file)), filename: basename(spec.file) };
}

/**
 * Runs one script step through the real services at the step's simulated time. Shared by the
 * demo and the eval. Bills arrive as documents (dataset revisions all come through the portal,
 * so a 'bill' step never supersedes anything); vendor replies use the portal path with a token
 * bound to the bill; people resolve escalations; a clock step executes the payments due, then
 * re-decides the open asks (the vendor deadline).
 */
export async function runStep(c: Container, step: ScriptStep): Promise<void> {
  await c.clock.set(step.at);
  switch (step.type) {
    case 'bill':
      await c.ingestDocument({
        ...datasetFile(step.billId),
        receivedAt: step.at,
        datasetId: step.billId,
      });
      return;
    case 'vendor_reply': {
      const token = await c.createPortalToken((await billOf(c, step.billId)).id);
      await c.vendorReply(token, {
        message: step.message,
        file: step.replyBillId ? datasetFile(step.replyBillId) : undefined,
        datasetId: step.replyBillId,
      });
      return;
    }
    case 'evidence':
      await c.addEvidence([step.item]);
      return;
    case 'human':
      await c.resolveEscalation((await billOf(c, step.billId)).id, step);
      return;
    case 'clock':
      await c.clock.set(step.to);
      await executeDue(c.deps, step.to);
      if (step.to === OCTOBER_CLOSE.to) await addStatementCardLine(c.deps);
      await c.expireAsks();
      return;
  }
}

export type Phase = 'idle' | 'september' | 'arriving' | 'october' | 'closed';
export type TourAction =
  'arrive-october' | 'reply-daniela' | 'accept-brand-kit' | 'merge-pr' | 'close-october';

const DANIELA = SCRIPT.octubre.find((s) => s.type === 'vendor_reply' && s.billId === 'oct-03')!;
const BRAND_KIT = SCRIPT.octubre.find(
  (s) => s.type === 'evidence' && s.item.id === SCRIPTED_EVIDENCE.linaAcceptsBrandKit.id,
)!;
const LIVE_MERGE = SCRIPT.octubre.find(
  (s) => s.type === 'evidence' && s.item.id === SCRIPTED_EVIDENCE.andresPrMerged.id,
)!;
const OCTOBER_BILLS = SCRIPT.octubre.filter((s) => s.type === 'bill');

const LABELS: Record<TourAction, string> = {
  'arrive-october': 'Llegan las cuentas de octubre',
  'reply-daniela': 'Daniela responde con la cuenta corregida',
  'accept-brand-kit': 'Lina acepta el Brand kit v2',
  'merge-pr': 'Se fusiona el PR del hito M3',
  'close-october': 'Cierre de octubre y extracto de Blinka',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoService {
  /** the script steps run since the last reset, in order (the eval's oracle replays them) */
  readonly log: ScriptStep[] = [];
  private running: Promise<unknown> | null = null;
  private generation = 0;

  constructor(
    private readonly c: Container,
    private readonly paceMs = c.config.demoPaceMs,
  ) {}

  /** the PR merged live: the configured repository, or the dataset's simulated one */
  private livePr() {
    const repo = this.c.config.github.repo ?? LIVE_PR.repo;
    const number = this.c.config.github.demoPr ?? LIVE_PR.number;
    return {
      ref: `${repo}#${number}`,
      id: prEvidenceId(repo, number),
      url: `https://github.com/${repo}/pull/${number}`,
      live: this.c.config.github.repo !== null,
    };
  }

  private async setPhase(phase: Phase): Promise<void> {
    await this.c.db.update(orgState).set({ phase }).where(eq(orgState.orgId, ORG_ID));
  }

  async phase(): Promise<Phase> {
    const [row] = await this.c.db.select().from(orgState).where(eq(orgState.orgId, ORG_ID));
    return (row?.phase as Phase | undefined) ?? 'idle';
  }

  private async run(step: ScriptStep): Promise<void> {
    await runStep(this.c, step);
    this.log.push(step);
  }

  /** Waits for a background action (the October arrival) to finish. */
  async idle(): Promise<void> {
    await this.running?.catch(() => undefined);
  }

  /** One action at a time; a second click while one runs is refused. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) throw new ServiceError(409, 'La demo está procesando otra acción.');
    const run = fn();
    this.running = run;
    void run.then(
      () => (this.running = null),
      () => (this.running = null),
    );
    return run;
  }

  /**
   * Empties the organization, seeds Altamar Labs at September 1 and lives through September with
   * the real services; the clock ends at October 1, 08:00.
   */
  async reset(): Promise<void> {
    this.generation++;
    await this.idle();
    await this.exclusive(async () => {
      await withOrgLock(() =>
        this.c.db.transaction(async (tx) => {
          for (const table of [
            vendors,
            contracts,
            documents,
            bills,
            decisions,
            evidenceItems,
            messages,
            portalTokens,
            humanActions,
            payments,
            bankLines,
            timeline,
            orgState,
          ])
            await tx.delete(table);
        }),
      );
      this.log.length = 0;
      await this.c.seed();
      await this.c.clock.set(DEMO_START);
      for (const step of SCRIPT.septiembre) await this.run(step);
      await this.setPhase('september');
      await addTimeline(
        this.c.db,
        await this.c.clock.now(),
        'demo',
        null,
        'Septiembre cerrado. Comienza octubre.',
      );
    });
  }

  private async done() {
    const evidence = await allEvidence(this.c.db);
    const kind = (id: string) => evidence.find((e) => e.id === id)?.kind;
    const [daniela] = await this.c.db
      .select({ id: bills.id })
      .from(bills)
      .where(eq(bills.datasetId, 'oct-03-r1'));
    return {
      'reply-daniela': daniela !== undefined,
      'accept-brand-kit':
        BRAND_KIT.type === 'evidence' && kind(BRAND_KIT.item.id) === 'deliverable_accepted',
      'merge-pr': kind(this.livePr().id) === 'pr_merged',
    };
  }

  async tourState() {
    const phase = await this.phase();
    const done = await this.done();
    const busy = this.running !== null;
    const available = (action: TourAction): boolean => {
      if (busy) return false;
      if (action === 'arrive-october') return phase === 'september' || phase === 'arriving';
      if (action === 'close-october') return phase === 'october';
      return phase === 'october' && !done[action];
    };
    const actions = (Object.keys(LABELS) as TourAction[]).map((id) => ({
      id,
      label: LABELS[id],
      available: available(id),
      done:
        id === 'arrive-october'
          ? ['october', 'closed'].includes(phase)
          : id === 'close-october'
            ? phase === 'closed'
            : done[id],
    }));
    const pr = this.livePr();
    return {
      phase,
      busy,
      now: await this.c.clock.now(),
      actions,
      livePr: { url: pr.url, live: pr.live },
    };
  }

  private async guard(action: TourAction): Promise<void> {
    const state = await this.tourState();
    if (!state.actions.find((a) => a.id === action)?.available)
      throw new ServiceError(409, 'Esta acción no está disponible en este punto del recorrido.');
  }

  async act(action: TourAction): Promise<Record<string, unknown>> {
    await this.guard(action);
    switch (action) {
      case 'arrive-october':
        await this.arriveOctober();
        return { started: true };
      case 'reply-daniela':
        await this.exclusive(() => this.run(DANIELA));
        return { ok: true };
      case 'accept-brand-kit':
        await this.exclusive(() => this.run(BRAND_KIT));
        return { ok: true };
      case 'merge-pr':
        return this.exclusive(() => this.mergeLivePr());
      case 'close-october':
        await this.exclusive(() => this.closeOctober());
        return { ok: true };
    }
  }

  /** Ingests the October bills in order, `paceMs` apart, in the background. */
  private async arriveOctober(): Promise<void> {
    await this.setPhase('arriving');
    const generation = this.generation;
    void this.exclusive(async () => {
      for (const step of OCTOBER_BILLS) {
        if (generation !== this.generation) return;
        await this.run(step);
        if (this.paceMs > 0) await sleep(this.paceMs);
      }
      if (generation === this.generation) await this.setPhase('october');
    }).catch((error: unknown) =>
      console.error(`Demo: la llegada de octubre falló: ${String(error)}`),
    );
  }

  /**
   * Without a GitHub repository, the PR is merged here (evidence labeled "simulado"). With one,
   * the clock moves to the merge moment and polling (or the webhook) sees the real merge.
   */
  private async mergeLivePr(): Promise<Record<string, unknown>> {
    const pr = this.livePr();
    await this.c.clock.set(LIVE_MERGE.at);
    if (pr.live) return { mode: 'live', url: pr.url };
    await this.c.github.simulateMerge(pr.ref);
    this.log.push(LIVE_MERGE);
    return { mode: 'simulated', url: pr.url };
  }

  /**
   * The rest of October in script order: other vendor replies, people's decisions, the deadline
   * and the close. A tour step already taken is not repeated; a reply to a case the tour already
   * settled (Estudio Ceiba's note once Lina accepted) no longer has anyone waiting for it; a live
   * PR nobody merged stays unmerged.
   */
  private async closeOctober(): Promise<void> {
    for (const step of SCRIPT.octubre) {
      if (step.type === 'bill') continue;
      const done = await this.done();
      if (step === DANIELA && done['reply-daniela']) continue;
      if (step === BRAND_KIT && done['accept-brand-kit']) continue;
      if (step === LIVE_MERGE && (done['merge-pr'] || this.livePr().live)) continue;
      if (step.type === 'vendor_reply' && !step.replyBillId) {
        const all = await this.c.db.select().from(bills);
        const original = await billOf(this.c, step.billId);
        const head = all.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(original.id));
        if (!head || !REOPENED.includes(head.status)) continue;
      }
      await this.run(step);
    }
    await this.setPhase('closed');
  }
}
