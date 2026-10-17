import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Port for original documents (filesystem here; object storage in a scaled deployment). */
export interface DocumentStore {
  put(orgId: string, sha256: string, extension: string, bytes: Buffer): Promise<string>;
  get(storagePath: string): Promise<Buffer>;
}

export class FileDocumentStore implements DocumentStore {
  constructor(private readonly root: string) {}

  async put(orgId: string, sha256: string, extension: string, bytes: Buffer): Promise<string> {
    const dir = join(this.root, orgId);
    await mkdir(dir, { recursive: true });
    const relative = join(orgId, `${sha256}${extension}`);
    await writeFile(join(this.root, relative), bytes);
    return relative;
  }

  get(storagePath: string): Promise<Buffer> {
    return readFile(join(this.root, storagePath));
  }
}

/** In-memory store for tests and the evaluation harness. */
export class MemoryDocumentStore implements DocumentStore {
  private readonly files = new Map<string, Buffer>();

  async put(orgId: string, sha256: string, extension: string, bytes: Buffer): Promise<string> {
    const key = `${orgId}/${sha256}${extension}`;
    this.files.set(key, bytes);
    return key;
  }

  async get(storagePath: string): Promise<Buffer> {
    const file = this.files.get(storagePath);
    if (!file) throw new Error(`document ${storagePath} not found`);
    return file;
  }
}
