import { CONTRACTS, DEMO_START, EVIDENCE, LIVE_PR, VENDORS } from '@recibido/dataset';
import type { Db } from '../db/client';
import { contracts, evidenceItems, orgState, vendors } from '../db/schema';
import { ORG_ID } from './state';

/**
 * Loads Altamar Labs: vendors, contracts and evidence. With a live GitHub repository configured,
 * the milestone that is merged live during the demo (LIVE_PR) points to that repository and PR.
 */
export async function seedOrganization(
  db: Db,
  github: { repo: string | null; demoPr: number | null } = { repo: null, demoPr: null },
): Promise<void> {
  const repo = github.repo ?? LIVE_PR.repo;
  const number = github.demoPr ?? LIVE_PR.number;
  const liveRef = `${LIVE_PR.repo}#${LIVE_PR.number}`;
  const contractRows = CONTRACTS.map((c) =>
    c.id !== LIVE_PR.contractId
      ? c
      : {
          ...c,
          terms: c.terms.map((t) =>
            t.id === LIVE_PR.termId
              ? { ...t, evidence: { type: 'github_pr' as const, repo, number } }
              : t,
          ),
        },
  );
  const evidenceRows = EVIDENCE.map((e) =>
    e.ref !== liveRef
      ? e
      : {
          ...e,
          id: prEvidenceId(repo, number),
          ref: `${repo}#${number}`,
          url: `https://github.com/${repo}/pull/${number}`,
        },
  );
  await db.transaction(async (tx) => {
    await tx
      .insert(vendors)
      .values(VENDORS.map((v) => ({ id: v.id, orgId: ORG_ID, data: v })))
      .onConflictDoNothing();
    await tx
      .insert(contracts)
      .values(contractRows.map((c) => ({ id: c.id, orgId: ORG_ID, vendorId: c.vendorId, data: c })))
      .onConflictDoNothing();
    await tx
      .insert(evidenceItems)
      .values(
        evidenceRows.map((e) => ({
          id: e.id,
          orgId: ORG_ID,
          vendorId: e.vendorId,
          data: e,
          updatedAt: DEMO_START,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(orgState)
      .values({ orgId: ORG_ID, now: DEMO_START, phase: 'idle' })
      .onConflictDoNothing();
  });
}

/** The evidence id of a PR, the same the dataset fixtures use. */
export const prEvidenceId = (repo: string, number: number) =>
  `gh-${repo.split('/')[1] ?? repo}-${number}`;
