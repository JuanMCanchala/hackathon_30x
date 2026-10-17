/**
 * Ground-truth reader and matcher (READER=reference, evaluation only): they serve the dataset's
 * labeled `truth` and `truthMatches` instead of asking a model.
 * - Reading looks a document up by the SHA-256 of its bytes.
 * - Matching looks a request up by the same stable JSON the live matcher's cache key uses
 *   (line descriptions/units/quantities + term ids/kinds/titles), indexed for the contract that
 *   holds each bill's labeled terms. With the reference reader the lines are the truth lines,
 *   so every dataset bill is found.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BILLS, CONTRACTS, filesDir, type BillSpec } from '@recibido/dataset';
import { stableJson, type LlmMeta } from '../llm/cache';
import { sha256Hex } from './documents';
import { matchInput, type Matcher, type MatchRequest, type MatchResult } from './matcher';
import type { ReadDocument, Reader, ReadResult } from './reader';

const META: LlmMeta = { provider: 'reference', model: null, cacheHit: false, latencyMs: 0 };

let bySha: Map<string, BillSpec> | null = null;
let byMatch: Map<string, BillSpec> | null = null;

function billsBySha(): Map<string, BillSpec> {
  bySha ??= new Map(BILLS.map((b) => [sha256Hex(readFileSync(join(filesDir(), b.file))), b]));
  return bySha;
}

function billsByMatch(): Map<string, BillSpec> {
  if (byMatch) return byMatch;
  byMatch = new Map();
  for (const bill of BILLS) {
    const termIds = new Set(bill.truthMatches.map((m) => m.termId).filter((id) => id !== null));
    const vendorContracts = CONTRACTS.filter((c) => c.vendorId === bill.vendorId);
    const labeled = vendorContracts.filter((c) => c.terms.some((t) => termIds.has(t.id)));
    for (const contract of labeled.length > 0 ? labeled : vendorContracts)
      byMatch.set(stableJson(matchInput(bill.truth.lines, contract)), bill);
  }
  return byMatch;
}

export class ReferenceReader implements Reader {
  async read(doc: ReadDocument): Promise<ReadResult> {
    const bill = billsBySha().get(doc.sha256);
    if (!bill)
      return { reading: null, error: 'documento fuera del conjunto de referencia', meta: META };
    return { reading: structuredClone(bill.truth), error: null, meta: { ...META } };
  }
}

export class ReferenceMatcher implements Matcher {
  async match({ lines, contract }: MatchRequest): Promise<MatchResult> {
    const bill = billsByMatch().get(stableJson(matchInput(lines, contract)));
    if (!bill)
      return { matches: null, error: 'líneas fuera del conjunto de referencia', meta: META };
    return { matches: structuredClone(bill.truthMatches), error: null, meta: { ...META } };
  }
}
