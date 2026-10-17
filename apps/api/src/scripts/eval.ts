/**
 * Evaluation gate. Runs both months of the labeled dataset through the real services (the same
 * `runStep` the demo uses) on an in-memory database, twice:
 * - reference: the dataset's ground-truth reading and line matching (are the rules right?)
 * - replay: the recorded answers of the real model (does the whole agent decide right?)
 * It never calls a model: a missing recording skips the replay run with a notice.
 *
 *   pnpm eval                 # both runs; writes .eval/report.json and .eval/report.md
 *   pnpm eval --write-docs    # also refreshes the results in docs/EVALUATION.md
 *
 * Exit code 1 on any improper payment, any checker violation, a step the services refused in
 * the reference run, or final-status accuracy below 95 % in any run.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  BILLS,
  DEMO_START,
  filesDir,
  recordingsDir,
  SCRIPT,
  type BillSpec,
  type Month,
} from '@recibido/dataset';
import {
  checkInvariants,
  scorecard,
  type BillStatus,
  type ExtractedBill,
  type Outcome,
  type Scorecard,
} from '@recibido/domain';
import { loadConfig } from '../config';
import { createContainer } from '../container';
import { openDatabase } from '../db/client';
import { bills, decisions, humanActions, messages } from '../db/schema';
import type { LlmRecord } from '../llm/cache';
import { documentText, sha256Hex } from '../reading/documents';
import { MATCHER_VERSION } from '../reading/matcher';
import { READER_VERSION } from '../reading/reader';
import { runStep } from '../services/demo';
import { ServiceError } from '../services/state';
import { checkerInput } from '../services/views';
import { CRITICAL_FIELDS, NO_READING, readingErrors } from './reading-fields';

const ACCURACY_GATE = 0.95;
const MONTHS: Month[] = ['septiembre', 'octubre'];
/** USD per token, DeepSeek V4.1 Flash (same price direct and on OpenRouter) */
const PRICE = { input: 0.15e-6, cacheRead: 0.003e-6, output: 0.6e-6 };
const MISSING_RECORDING = /sin (lectura|cruce) grabad/;

type Mode = 'reference' | 'replay';
type ResolvedBy = BillSpec['expected']['resolvedBy'];

interface BillScore {
  id: string;
  month: Month;
  story: string;
  expected: BillSpec['expected'];
  first: Outcome | null;
  final: BillStatus | null;
  resolvedBy: ResolvedBy | null;
  /** a case: an original bill (corrections belong to the case of the bill they replace) */
  isCase: boolean;
  decidedCorrectlyWithoutPerson: boolean;
  fieldErrors: string[];
}

interface Metrics {
  group: string;
  bills: number;
  firstCorrect: number;
  finalCorrect: number;
  cases: number;
  /** cases whose labels say a person is not needed */
  ceiling: number;
  decidedCorrectlyWithoutPerson: number;
  vendorResolved: number;
  escalated: number;
  held: number;
  improperPayments: number;
  violations: number;
  evidenceCoveragePct: number;
  yieldKeptUsdMinor: number;
  feesSavedUsdMinor: number;
  medianHoursToPayment: number | null;
  /** critical fields read correctly (replay only) */
  fields: { total: number; correct: number } | null;
}

interface Report {
  mode: Mode;
  bills: BillScore[];
  groups: Metrics[];
  totals: Metrics;
  problems: string[];
  gates: { name: string; passed: boolean; detail: string }[];
}

const pct = (part: number, whole: number) => (whole > 0 ? (part * 100) / whole : 0);
const fmtPct = (part: number, whole: number) => `${pct(part, whole).toFixed(1)} %`;
const usd = (minor: number) =>
  `USD ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Every model recording of the current reader and matcher versions. */
function currentRecordings(): LlmRecord[] {
  const out: LlmRecord[] = [];
  for (const kind of ['read', 'match'] as const) {
    const dir = join(recordingsDir(), kind);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const record = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LlmRecord;
      if (record.version === (kind === 'read' ? READER_VERSION : MATCHER_VERSION)) out.push(record);
    }
  }
  return out;
}

async function runMode(mode: Mode): Promise<{ report: Report; missing: string[] }> {
  // Built from scratch, not from process.env: the eval never sees a key, so it never calls a model.
  const config = loadConfig({
    READER: mode === 'reference' ? 'reference' : 'auto',
    LLM_PROVIDER: 'none',
    DEMO_MODE: 'true',
    DEMO_PACE_MS: '0',
  });
  const database = await openDatabase({});
  const c = await createContainer(config, { db: database.db });
  const problems: string[] = [];
  try {
    await c.seed();
    await c.clock.set(DEMO_START);
    for (const month of MONTHS)
      for (const step of SCRIPT[month]) {
        try {
          await runStep(c, step);
        } catch (error) {
          if (!(error instanceof ServiceError)) throw error;
          const what = step.type === 'clock' || step.type === 'evidence' ? step.label : step.billId;
          problems.push(`${step.type} ${what}: ${error.message}`);
        }
      }

    const rows = await c.db.select().from(bills);
    const decisionRows = (await c.db.select().from(decisions)).sort((a, b) => a.seq - b.seq);
    const msgs = await c.db.select().from(messages);
    const actions = await c.db.select().from(humanActions);
    const input = await checkerInput(c.db);
    const violations = checkInvariants(input);

    const missing = rows
      .filter(
        (b) =>
          MISSING_RECORDING.test(b.readingMeta?.error ?? '') ||
          MISSING_RECORDING.test(b.matchMeta?.error ?? ''),
      )
      .map((b) => b.datasetId ?? b.id);

    const datasetOf = new Map(rows.map((b) => [b.id, b.datasetId]));
    const monthOfBill = (billId: string) => {
      const id = datasetOf.get(billId);
      return BILLS.find((s) => s.id === id)?.month ?? null;
    };

    // Reading accuracy covers every document, also one the run never received (a reply the
    // services refused after a misread): its recorded reading is read here the same way.
    const readings = new Map<string, ExtractedBill | null>();
    if (mode === 'replay')
      for (const spec of BILLS) {
        const bytes = readFileSync(join(filesDir(), spec.file));
        const filename = basename(spec.file);
        const doc = await documentText(bytes, filename);
        const read = await c.deps.reader.read({ sha256: sha256Hex(bytes), filename, ...doc });
        readings.set(spec.id, read.reading);
      }

    const scores: BillScore[] = BILLS.map((spec) => {
      const row = rows.find((b) => b.datasetId === spec.id);
      const head = row && rows.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(row.id));
      const chain = head?.chain ?? [];
      const byPerson =
        actions.some((a) => chain.includes(a.billId)) ||
        ['ESCALATED', 'APPROVED', 'REJECTED'].includes(head?.status ?? '');
      // the vendor resolved it: it answered, or the agent asked it for something (an ASK VENDOR,
      // or the rest of a PAY PART) and the gap then closed
      const byVendor =
        msgs.some((m) => m.sender === 'vendor' && chain.includes(m.billId)) ||
        decisionRows.some(
          (d) => chain.includes(d.billId) && (d.outcome === 'ASK_VENDOR' || d.data.askMinor > 0),
        );
      const resolvedBy: ResolvedBy | null = !head
        ? null
        : byPerson
          ? 'person'
          : byVendor
            ? 'vendor'
            : 'agent';
      const final = head?.status ?? null;
      return {
        id: spec.id,
        month: spec.month,
        story: spec.story,
        expected: spec.expected,
        first: (decisionRows.find((d) => d.billId === row?.id)?.outcome as Outcome) ?? null,
        final,
        resolvedBy,
        isCase: !spec.revisionOfBillId,
        decidedCorrectlyWithoutPerson:
          final === spec.expected.final &&
          resolvedBy !== 'person' &&
          ['PAID', 'PART_PAID', 'HELD'].includes(final ?? ''),
        fieldErrors:
          mode === 'replay' ? readingErrors(spec.truth, readings.get(spec.id) ?? null) : [],
      };
    });

    const metrics = (group: string, month: Month | null): Metrics => {
      const list = scores.filter((s) => month === null || s.month === month);
      const ids = new Set(
        rows.filter((b) => month === null || monthOfBill(b.id) === month).map((b) => b.id),
      );
      const card: Scorecard = scorecard({
        ...input,
        bills: input.bills.filter((b) => ids.has(b.id)),
        payments: input.payments.filter((p) => ids.has(p.billId)),
        messages: msgs.flatMap((m) =>
          m.sender === 'agent' || m.sender === 'vendor'
            ? [{ billId: m.billId, from: m.sender }]
            : [],
        ),
        humanActions: actions.map((a) => ({ billId: a.billId })),
      });
      const mine = violations.filter((v) => ids.has(v.billId));
      const cases = list.filter((s) => s.isCase);
      return {
        group,
        bills: list.length,
        firstCorrect: list.filter((s) => s.first === s.expected.first).length,
        finalCorrect: list.filter((s) => s.final === s.expected.final).length,
        cases: cases.length,
        ceiling: cases.filter((s) => s.expected.resolvedBy !== 'person').length,
        decidedCorrectlyWithoutPerson: cases.filter((s) => s.decidedCorrectlyWithoutPerson).length,
        vendorResolved: cases.filter(
          (s) => s.decidedCorrectlyWithoutPerson && s.resolvedBy === 'vendor',
        ).length,
        escalated: cases.filter((s) => s.resolvedBy === 'person').length,
        held: cases.filter((s) => s.final === 'HELD').length,
        improperPayments: new Set(mine.map((v) => v.paymentId).filter((id) => id !== null)).size,
        violations: mine.length,
        evidenceCoveragePct: card.evidenceCoveragePct,
        yieldKeptUsdMinor: card.yieldKeptUsdMinor,
        feesSavedUsdMinor: card.feesSavedUsdMinor,
        medianHoursToPayment: card.medianHoursToPayment,
        fields:
          mode === 'replay'
            ? {
                total: list.length * CRITICAL_FIELDS.length,
                correct:
                  list.length * CRITICAL_FIELDS.length -
                  list.reduce(
                    (n, s) =>
                      n +
                      (s.fieldErrors[0] === NO_READING
                        ? CRITICAL_FIELDS.length
                        : s.fieldErrors.length),
                    0,
                  ),
              }
            : null,
      };
    };
    const groups = MONTHS.map((m) => metrics(m, m));
    const totals = metrics('total', null);
    const gates = [
      {
        name: 'Zero improper payments',
        passed: totals.improperPayments === 0,
        detail: `${totals.improperPayments} improper payments`,
      },
      {
        name: 'Independent checker: no violations',
        passed: violations.length === 0,
        detail: `${violations.length} violations`,
      },
      {
        name: `Final status correct ≥ ${ACCURACY_GATE * 100} %`,
        passed: totals.finalCorrect / totals.bills >= ACCURACY_GATE,
        detail: `${totals.finalCorrect}/${totals.bills} (${fmtPct(totals.finalCorrect, totals.bills)})`,
      },
      // with perfect reading every step must go through; with the model's reading a refused step
      // is a consequence of a misread bill and already shows in the accuracy
      ...(mode === 'reference'
        ? [
            {
              name: 'Every script step accepted',
              passed: problems.length === 0,
              detail: `${problems.length} steps refused`,
            },
          ]
        : []),
    ];
    for (const v of violations)
      problems.push(`violación ${v.invariant} en ${v.billId}: ${v.detail}`);
    return { report: { mode, bills: scores, groups, totals, problems, gates }, missing };
  } finally {
    await c.close();
    await database.close();
  }
}

interface TokenUsage {
  reads: number;
  matches: number;
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costUsd: number;
  costUsdNoCache: number;
  perBill: { inputTokens: number; outputTokens: number; costUsd: number };
  models: string[];
}

function tokenUsage(records: LlmRecord[]): TokenUsage {
  const sum = (f: (r: LlmRecord) => number) => records.reduce((s, r) => s + f(r), 0);
  const inputTokens = sum((r) => r.usage.inputTokens);
  const cacheReadTokens = sum((r) => r.usage.cacheReadTokens);
  const outputTokens = sum((r) => r.usage.outputTokens);
  const costUsd =
    (inputTokens - cacheReadTokens) * PRICE.input +
    cacheReadTokens * PRICE.cacheRead +
    outputTokens * PRICE.output;
  const n = BILLS.length;
  return {
    reads: records.filter((r) => r.kind === 'read').length,
    matches: records.filter((r) => r.kind === 'match').length,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    costUsd,
    costUsdNoCache: inputTokens * PRICE.input + outputTokens * PRICE.output,
    perBill: {
      inputTokens: Math.round(inputTokens / n),
      outputTokens: Math.round(outputTokens / n),
      costUsd: costUsd / n,
    },
    models: [...new Set(records.map((r) => `${r.provider} · ${r.model}`))],
  };
}

const TITLE: Record<Mode, string> = {
  reference: 'Reference run (ground-truth reading and matching)',
  replay: 'Replay run (recorded readings and matches of the real model)',
};

function markdown(reports: Report[], usage: TokenUsage, skipped: string | null, full: boolean) {
  const out: string[] = [
    'Baseline: today **100 %** of Altamar Labs’ services bills go to a person (nobody can prove delivery without one).',
    '',
  ];
  for (const r of reports) {
    out.push(`### ${TITLE[r.mode]}`, '');
    out.push(
      '| Month | Bills | First decision correct | Final status correct | Cases | Decided correctly without a person | of which the vendor resolved | Went to a person | Held | Improper payments | Evidence coverage | Yield kept | Fees saved | Median hours bill → payment |' +
        (r.mode === 'replay' ? ' Critical fields read correctly |' : ''),
    );
    out.push(
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |' +
        (r.mode === 'replay' ? ' ---: |' : ''),
    );
    for (const g of [...r.groups, r.totals]) {
      const name = g.group === 'total' ? '**Total**' : g.group;
      out.push(
        `| ${name} | ${g.bills} | ${g.firstCorrect} (${fmtPct(g.firstCorrect, g.bills)}) | ${g.finalCorrect} (${fmtPct(g.finalCorrect, g.bills)}) | ${g.cases} | ${g.decidedCorrectlyWithoutPerson} (${fmtPct(g.decidedCorrectlyWithoutPerson, g.cases)}; ceiling ${fmtPct(g.ceiling, g.cases)}) | ${g.vendorResolved} | ${g.escalated} | ${g.held} | ${g.improperPayments} | ${g.evidenceCoveragePct.toFixed(1)} % | ${usd(g.yieldKeptUsdMinor)} | ${usd(g.feesSavedUsdMinor)} | ${g.medianHoursToPayment ?? '—'} |` +
          (g.fields
            ? ` ${g.fields.correct}/${g.fields.total} (${fmtPct(g.fields.correct, g.fields.total)}) |`
            : ''),
      );
    }
    out.push('', '| Gate | Result |', '| --- | --- |');
    for (const gate of r.gates)
      out.push(`| ${gate.name} | ${gate.passed ? 'pass' : '**FAIL**'} · ${gate.detail} |`);
    const differs = r.bills.filter(
      (b) =>
        b.first !== b.expected.first ||
        b.final !== b.expected.final ||
        b.resolvedBy !== b.expected.resolvedBy ||
        b.fieldErrors.length > 0,
    );
    const shown = full ? r.bills : differs;
    out.push('');
    if (shown.length === 0) out.push('Every bill matches its labels.');
    else {
      out.push(full ? 'Per bill:' : 'Bills that differ from their labels:', '');
      out.push(
        '| Bill | Expected first → final | Got first → final | Resolved by | Reading differences |',
      );
      out.push('| --- | --- | --- | --- | --- |');
      for (const b of shown) {
        const mark = b.first === b.expected.first && b.final === b.expected.final ? '' : ' ✗';
        out.push(
          `| \`${b.id}\`${mark} | ${b.expected.first} → ${b.expected.final} | ${b.first ?? '—'} → ${b.final ?? '—'} | ${b.resolvedBy ?? '—'} (label: ${b.expected.resolvedBy}) | ${b.fieldErrors.join('; ') || '—'} |`,
        );
      }
    }
    if (r.problems.length) {
      out.push('', 'Steps the services refused, and checker findings:', '');
      for (const p of r.problems) out.push(`- ${p}`);
    }
    out.push('');
  }
  if (skipped) out.push(`> Replay run skipped: ${skipped}`, '');
  out.push(
    '### Model usage (recordings)',
    '',
    `Recorded with ${usage.models.join(', ') || '—'}: ${usage.reads} readings and ${usage.matches} line matchings for ${BILLS.length} bills.`,
    '',
    '| Input tokens | of which cache hits | Output tokens | Cost | Cost without cache | Mean per bill (input / output / cost) |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${usage.inputTokens.toLocaleString('en-US')} | ${usage.cacheReadTokens.toLocaleString('en-US')} | ${usage.outputTokens.toLocaleString('en-US')} | USD ${usage.costUsd.toFixed(4)} | USD ${usage.costUsdNoCache.toFixed(4)} | ${usage.perBill.inputTokens} / ${usage.perBill.outputTokens} / USD ${usage.perBill.costUsd.toFixed(5)} |`,
    '',
    'Prices: DeepSeek V4.1 Flash, USD 0.15 per million input tokens (cache miss), 0.003 per million cached input tokens, 0.60 per million output tokens.',
    '',
  );
  return out.join('\n');
}

async function main() {
  const writeDocs = process.argv.includes('--write-docs');
  const reports: Report[] = [];
  let skipped: string | null = null;
  for (const mode of ['reference', 'replay'] as const) {
    const { report, missing } = await runMode(mode);
    if (mode === 'replay' && missing.length > 0) {
      skipped = `${missing.length} bills have no recorded model answer (${missing.join(', ')}); run \`pnpm record\`.`;
      console.warn(`\n⚠ Replay omitido: ${skipped}`);
      continue;
    }
    reports.push(report);
    console.info(`\n${TITLE[mode]}`);
    for (const g of [...report.groups, report.totals]) {
      console.info(
        `  ${g.group.padEnd(10)} ${g.bills} cuentas · primera decisión ${fmtPct(g.firstCorrect, g.bills)} · estado final ${g.finalCorrect}/${g.bills} (${fmtPct(g.finalCorrect, g.bills)}) · sin persona ${g.decidedCorrectlyWithoutPerson}/${g.cases} (${fmtPct(g.decidedCorrectlyWithoutPerson, g.cases)}) · proveedor ${g.vendorResolved} · a persona ${g.escalated} · retenidas ${g.held} · pagos indebidos ${g.improperPayments} · cobertura ${g.evidenceCoveragePct.toFixed(1)} % · rendimiento ${usd(g.yieldKeptUsdMinor)} · comisiones ${usd(g.feesSavedUsdMinor)} · mediana ${g.medianHoursToPayment ?? '—'} h` +
          (g.fields ? ` · lectura ${fmtPct(g.fields.correct, g.fields.total)}` : ''),
      );
    }
    for (const b of report.bills.filter(
      (x) => x.first !== x.expected.first || x.final !== x.expected.final,
    ))
      console.info(
        `  ✗ ${b.id}: esperado ${b.expected.first} → ${b.expected.final}, obtuvo ${b.first ?? '—'} → ${b.final ?? '—'}${b.fieldErrors.length ? ` (${b.fieldErrors.join('; ')})` : ''}`,
      );
    for (const p of report.problems) console.info(`  ! ${p}`);
    for (const gate of report.gates)
      console.info(`  ${gate.passed ? '✓' : '✗'} ${gate.name}: ${gate.detail}`);
    if (report.gates.some((g) => !g.passed)) process.exitCode = 1;
  }
  const usage = tokenUsage(currentRecordings());
  console.info(
    `\nUso del modelo (grabaciones): ${usage.reads} lecturas + ${usage.matches} cruces · ${usage.inputTokens} tokens de entrada (${usage.cacheReadTokens} en caché) · ${usage.outputTokens} de salida · USD ${usage.costUsd.toFixed(4)} · por cuenta ${usage.perBill.inputTokens}/${usage.perBill.outputTokens} tokens, USD ${usage.perBill.costUsd.toFixed(5)}`,
  );
  console.info('Línea base: hoy el 100 % de las cuentas de servicios pasa por una persona.');

  const root = loadConfig({}).repoRoot;
  const outDir = join(root, '.eval');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'report.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), reports, usage, skipped }, null, 2)}\n`,
  );
  await writeFile(join(outDir, 'report.md'), markdown(reports, usage, skipped, true));
  if (writeDocs) {
    const docPath = join(root, 'docs', 'EVALUATION.md');
    const doc = await readFile(docPath, 'utf8');
    await writeFile(
      docPath,
      doc.replace(
        /<!-- eval:start -->[\s\S]*<!-- eval:end -->/,
        `<!-- eval:start -->\n\n${markdown(reports, usage, skipped, false)}\n<!-- eval:end -->`,
      ),
    );
    console.info('docs/EVALUATION.md actualizado.');
  }
  console.info('Informe en .eval/report.md');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
