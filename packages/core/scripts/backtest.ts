/**
 * `pnpm eval`: replays the detector over the saved history and fails if it misses too many AI
 * waves or raises too many false alarms on stable topics (GATE in src/backtest.ts).
 * Writes fixtures/backtest/report.json, which the evaluation screen reads.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  describeBacktest,
  runBacktest,
  type BacktestSeriesFile,
  type WavesFile,
} from '../src/backtest';
import { languageLag, type LanguageLagFile } from '../src/language-lag';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/backtest');
const SERIES = join(DIR, 'series');

// Only the series waves.json declares for each topic count, whatever an older fetch saved.
const waves = JSON.parse(await readFile(join(DIR, 'waves.json'), 'utf8')) as WavesFile;
const declared = new Map(
  waves.topics.map((t) => [
    t.id,
    new Set([t.wikipedia?.length ? 'wikipedia' : '', t.hn ? 'hn' : '', t.bluesky ? 'bluesky' : '']),
  ]),
);
const files: BacktestSeriesFile[] = [];
if (existsSync(SERIES)) {
  for (const name of (await readdir(SERIES)).filter((n) => n.endsWith('.json')).sort()) {
    const file = JSON.parse(await readFile(join(SERIES, name), 'utf8')) as BacktestSeriesFile;
    const keep = declared.get(file.id);
    if (!keep) continue;
    const spec = waves.topics.find((t) => t.id === file.id)!;
    file.kind = spec.kind;
    file.name = spec.name;
    if (spec.event) file.event = spec.event;
    for (const source of ['wikipedia', 'hn', 'bluesky'] as const) {
      if (!keep.has(source)) delete file[source];
    }
    files.push(file);
  }
}
if (!files.length) {
  console.error('No hay series guardadas. Corre primero scripts/fetch-backtest.ts.');
  process.exit(1);
}

const report = runBacktest(files);
// Recorded by packages/sources/scripts/fetch-language-lag.ts: how late Spanish Wikipedia arrives.
const lagPath = join(DIR, 'language-lag.json');
const lag = existsSync(lagPath)
  ? languageLag(JSON.parse(await readFile(lagPath, 'utf8')) as LanguageLagFile)
  : null;
const fetched =
  files
    .map((f) => f.fetchedAt ?? '')
    .sort()
    .at(-1) || null;
// Written the way Prettier would, so `pnpm format:check` stays green after every run.
const reportPath = join(DIR, 'report.json');
await writeFile(
  reportPath,
  await format(JSON.stringify({ seriesFetchedAt: fetched, ...report, languageLag: lag }), {
    ...(await resolveConfig(reportPath)),
    parser: 'json',
  }),
);

console.log('Backtest del radar: ¿habría visto venir las olas de IA de 2025–2026?\n');
for (const line of describeBacktest(report)) console.log(`  ${line}`);
console.log('');
for (const w of report.waves) {
  const when = w.detected
    ? `señal el ${w.detectedWeek} (${w.detectedBy.join(' + ')}), ${w.leadDays} días antes del pico`
    : 'sin señal en su subida';
  console.log(`  ${w.detected ? '✓' : '✗'} ${w.name}: pico ${w.peakWeek ?? '—'}; ${when}`);
}
for (const c of report.controls) {
  const alarms = c.alarms.map((a) => `${a.week} (${a.sources.join(' + ')})`).join(', ');
  console.log(
    `  ${c.falseAlarm ? '!' : '·'} ${c.name}: ${c.falseAlarm ? `falsa alarma ${alarms}` : 'sin alarmas'}`,
  );
}
if (lag) {
  console.log('\nCuánto tarda una ola en llegar a Wikipedia en español:');
  if (lag.medianCreatedLagDays !== null)
    console.log(
      `  mediana de ${lag.medianCreatedLagDays} días entre el artículo en inglés y el de español (${lag.counted.created} olas con artículo propio)`,
    );
  if (lag.medianPeakLagDays !== null)
    console.log(
      `  mediana de ${lag.medianPeakLagDays} días entre el pico de visitas en inglés y en español (${lag.counted.peak} olas)`,
    );
  console.log(`  ${lag.counted.notInSpanish} de ${lag.counted.waves} olas sin artículo en español`);
}
process.exit(report.passed ? 0 : 1);
