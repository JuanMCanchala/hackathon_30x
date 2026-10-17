/**
 * Poppler (pdftotext, pdftoppm), when installed: exact text layers that keep their layout, and
 * page images for multimodal readers. pdf.js loses some glyphs (figures in certain fonts); poppler
 * does not. Without the binaries both helpers degrade to nothing and callers fall back.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function withTempPdf<T>(bytes: Buffer, fn: (dir: string, file: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'mandato-pdf-'));
  try {
    const file = join(dir, 'document.pdf');
    await writeFile(file, bytes);
    return await fn(dir, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The PDF's text with its columns aligned, or null without poppler. */
export async function pdfLayoutText(bytes: Buffer): Promise<string | null> {
  try {
    return await withTempPdf(bytes, async (_dir, file) => {
      const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], {
        maxBuffer: 16 * 1024 * 1024,
      });
      return stdout;
    });
  } catch {
    return null;
  }
}

/** PNG images of the first pages, or none without poppler. */
export async function pdfPageImages(bytes: Buffer, maxPages = 3, dpi = 110): Promise<Buffer[]> {
  try {
    return await withTempPdf(bytes, async (dir, file) => {
      const args = ['-png', '-r', String(dpi), '-f', '1', '-l', String(maxPages)];
      await run('pdftoppm', [...args, file, join(dir, 'page')], { maxBuffer: 64 * 1024 * 1024 });
      const pages = (await readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png'));
      return Promise.all(pages.sort().map((f) => readFile(join(dir, f))));
    });
  } catch {
    return [];
  }
}
