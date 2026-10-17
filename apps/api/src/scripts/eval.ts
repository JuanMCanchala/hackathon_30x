/**
 * Evaluation harness (ADR-0015): runs the evaluation service and prints it, writes the report,
 * and optionally refreshes docs/EVALUATION.md.
 *
 *   pnpm eval                    # engine run (perfect reading) + end-to-end run (recorded readings)
 *   pnpm eval --mode truth       # engine only
 *   pnpm eval --write-docs       # also refresh the results section of docs/EVALUATION.md
 *
 * Exits with code 1 when a gate fails: any unsafe payment, any auditor violation, any decision
 * without a receipt, or decision accuracy below the threshold.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config';
import { recordingsMissing, runMode, type RunReport } from '../services/evaluation';

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

function markdown(reports: RunReport[], missing: string[]): string {
  const lines: string[] = [];
  for (const r of reports) {
    lines.push(
      `### ${r.mode === 'truth' ? 'Engine run (perfect reading)' : `End-to-end run (recorded readings: ${r.reader})`}`,
    );
    lines.push('');
    lines.push(
      '| Group | Bills | Correct | Decision accuracy | Correct autonomy | Autonomy ceiling | Unsafe payments | Unnecessary escalations |',
    );
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const g of [...r.groups, r.totals]) {
      lines.push(
        `| ${g.group} | ${g.total} | ${g.correct} | ${pct(g.accuracy)} | ${pct(g.correctAutonomy)} | ${pct(g.autonomyCeiling)} | ${g.unsafe} | ${g.unnecessaryEscalations} |`,
      );
    }
    lines.push('');
    lines.push(
      `Auditor: **${r.audit.ok ? '0 violations' : `${r.audit.violations} violations`}** · chain ${r.audit.chainIntact ? 'intact' : 'BROKEN'} · ${r.audit.paymentsChecked} payments and ${r.audit.decisionsChecked} decisions re-checked.`,
    );
    if (r.extraction) {
      lines.push('');
      lines.push(
        `Extraction accuracy on critical fields: **${pct(r.extraction.accuracy)}** (${r.extraction.correct}/${r.extraction.fields}).`,
      );
    }
    lines.push('');
    lines.push('| Gate | Result |');
    lines.push('| --- | --- |');
    for (const gate of r.gates)
      lines.push(`| ${gate.name} | ${gate.passed ? '✅' : '❌'} ${gate.detail} |`);
    const wrong = r.bills.filter((b) => !b.correct);
    if (wrong.length) {
      lines.push('');
      lines.push('Mismatches:');
      for (const b of wrong)
        lines.push(
          `- \`${b.id}\` ${b.title}: expected ${b.expected}, got ${b.actual ?? '—'}${b.fieldErrors.length ? ` (${b.fieldErrors.join('; ')})` : ''}`,
        );
    }
    lines.push('');
  }
  if (missing.length) {
    lines.push(
      `> End-to-end run skipped: ${missing.length} documents have no recorded extraction (\`pnpm extractions:record\`).`,
    );
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'both';
  const requireReplay = args.includes('--require-replay');
  const missing = await recordingsMissing();
  const modes: ('truth' | 'replay')[] =
    modeArg === 'truth' ? ['truth'] : modeArg === 'replay' ? ['replay'] : ['truth', 'replay'];
  const runnable = modes.filter((m) => m !== 'replay' || missing.length === 0);
  if (modes.includes('replay') && missing.length) {
    console.warn(`⚠ ${missing.length} documentos sin lectura grabada: ${missing.join(', ')}`);
    if (requireReplay) process.exitCode = 1;
  }

  const reports: RunReport[] = [];
  for (const mode of runnable) {
    const report = await runMode(mode);
    reports.push(report);
    console.info(
      `\n${mode === 'truth' ? 'Motor (lectura perfecta)' : `De punta a punta (lecturas grabadas: ${report.reader})`}`,
    );
    for (const g of [...report.groups, report.totals]) {
      console.info(
        `  ${g.group.padEnd(11)} ${String(g.correct).padStart(2)}/${String(g.total).padEnd(2)} correctas · autonomía correcta ${pct(g.correctAutonomy)} (techo ${pct(g.autonomyCeiling)}) · pagos indebidos ${g.unsafe}`,
      );
    }
    if (report.extraction)
      console.info(`  Lectura: ${pct(report.extraction.accuracy)} de campos críticos correctos`);
    console.info(
      `  Auditor: ${report.audit.ok ? '0 violaciones' : `${report.audit.violations} violaciones`}, cadena ${report.audit.chainIntact ? 'íntegra' : 'ROTA'}`,
    );
    for (const gate of report.gates)
      console.info(`  ${gate.passed ? '✓' : '✗'} ${gate.name}: ${gate.detail}`);
    for (const b of report.bills.filter((x) => !x.correct)) {
      console.info(
        `  ✗ ${b.id} esperado ${b.expected}, obtuvo ${b.actual} ${b.fieldErrors.join('; ')}`,
      );
    }
    if (report.gates.some((g) => !g.passed)) process.exitCode = 1;
  }

  const outDir = join(loadConfig().repoRoot, '.eval');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), reports, missing }, null, 2),
  );
  const md = markdown(reports, missing);
  await writeFile(join(outDir, 'report.md'), md);
  if (args.includes('--write-docs')) {
    const docPath = join(loadConfig().repoRoot, 'docs/EVALUATION.md');
    const doc = await readFile(docPath, 'utf8');
    const updated = doc.replace(
      /<!-- eval:start -->[\s\S]*<!-- eval:end -->/,
      `<!-- eval:start -->\n\n${md}\n<!-- eval:end -->`,
    );
    await writeFile(docPath, updated);
    console.info('\ndocs/EVALUATION.md actualizado.');
  }
  console.info(`\nInforme en .eval/report.md`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
