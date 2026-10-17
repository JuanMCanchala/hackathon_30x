/** Composition root: wires the database, the clock, the reader and the services from config. */
import { recordingsDir } from '@recibido/dataset';
import type { Config } from './config';
import { openDatabase, type Db } from './db/client';
import { CachedLlm, LlmCache } from './llm/cache';
import type { Fetch } from './llm/client';
import { LineMatcher, type Matcher } from './reading/matcher';
import { BillReader, type Reader } from './reading/reader';
import { ReferenceMatcher, ReferenceReader } from './reading/reference';
import { evaluateBill, ingestDocument, type IngestInput } from './services/bills';
import {
  acceptDeliverable,
  addEvidence,
  importTimeEntriesCsv,
  reevaluateVendor,
  upsertEvidence,
} from './services/evidence';
import { GithubEvidence } from './services/github';
import { resolveEscalation, type Resolution } from './services/humans';
import { orgClock, type Clock } from './services/clock';
import { seedOrganization } from './services/seed';
import type { Deps } from './services/state';
import {
  createPortalToken,
  expireAsks,
  portalView,
  vendorReply,
  type VendorReply,
} from './services/vendor-loop';
import type { EvidenceItem } from '@recibido/domain';

export interface ContainerOverrides {
  /** an open database (tests); otherwise one is opened from config */
  db?: Db;
  fetch?: Fetch;
  clock?: Clock;
  reader?: Reader;
  matcher?: Matcher;
}

export type Container = Awaited<ReturnType<typeof createContainer>>;

export async function createContainer(config: Config, overrides: ContainerOverrides = {}) {
  const database = overrides.db
    ? null
    : await openDatabase({
        url: config.databaseUrl ?? undefined,
        dataDir: config.databaseUrl ? undefined : config.dataDir,
      });
  const db = overrides.db ?? database!.db;
  const llm = new CachedLlm(new LlmCache(recordingsDir()), config.llm, {
    record: config.record,
    fetch: overrides.fetch,
  });
  const reference = config.reader === 'reference';
  const deps: Deps = {
    db,
    clock: overrides.clock ?? orgClock(db),
    reader: overrides.reader ?? (reference ? new ReferenceReader() : new BillReader(llm)),
    matcher: overrides.matcher ?? (reference ? new ReferenceMatcher() : new LineMatcher(llm)),
  };
  const github = new GithubEvidence(deps, {
    repo: config.github.repo,
    token: config.github.token,
    webhookSecret: config.github.webhookSecret,
    fetch: overrides.fetch,
  });
  return {
    config,
    deps,
    db,
    clock: deps.clock,
    github,
    seed: () => seedOrganization(db, config.github),
    ingestDocument: (input: IngestInput) => ingestDocument(deps, input),
    evaluateBill: (billId: string) => evaluateBill(deps, billId),
    createPortalToken: (billId: string) => createPortalToken(deps, billId),
    portalView: (token: string) => portalView(deps, token),
    vendorReply: (token: string, reply: VendorReply) => vendorReply(deps, token, reply),
    expireAsks: (now?: string) => expireAsks(deps, now),
    resolveEscalation: (billId: string, resolution: Resolution) =>
      resolveEscalation(deps, billId, resolution),
    upsertEvidence: (items: EvidenceItem[]) => upsertEvidence(deps, items),
    addEvidence: (items: EvidenceItem[]) => addEvidence(deps, items),
    reevaluateVendor: (vendorId: string) => reevaluateVendor(deps, vendorId),
    acceptDeliverable: (deliverableId: string, actor: string) =>
      acceptDeliverable(deps, deliverableId, actor),
    importTimeEntriesCsv: (csv: string) => importTimeEntriesCsv(deps, csv),
    close: async () => {
      github.stopPolling();
      await database?.close();
    },
  };
}
