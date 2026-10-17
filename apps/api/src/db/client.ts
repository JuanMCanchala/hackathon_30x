import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
/** Driver-agnostic database handle: node-postgres in production, PGlite locally and in tests. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the database or an open transaction. */
export type Executor = Db | Tx;

export interface Database {
  db: Db;
  kind: 'postgres' | 'pglite';
  close: () => Promise<void>;
}

function migrationsFolder(): string {
  // paths joined from this file's directory (not `new URL(…, import.meta.url)`, which bundlers
  // such as Next's take for an asset to resolve at build time)
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    // bundled build: dist/index.js → dist/drizzle
    join(here, 'drizzle'),
    // bundled script: dist/scripts/x.js → dist/drizzle
    join(here, '../drizzle'),
    // source: src/db/client.ts → drizzle
    join(here, '../../drizzle'),
  ];
  const found = candidates.find((dir) => dir && existsSync(`${dir}/meta/_journal.json`));
  if (!found) throw new Error('Database migrations not found');
  return found;
}

/**
 * Opens the database and applies migrations.
 * - `url` set → PostgreSQL through node-postgres.
 * - `dataDir` set → PGlite persisted on disk.
 * - neither → in-memory PGlite (tests, evaluation harness).
 */
export async function openDatabase(options: { url?: string; dataDir?: string }): Promise<Database> {
  if (options.url) {
    const pool = new pg.Pool({ connectionString: options.url, max: 10 });
    const db = drizzleNodePg(pool, { schema }) as unknown as Db;
    await migrateNodePg(db as never, { migrationsFolder: migrationsFolder() });
    return { db, kind: 'postgres', close: () => pool.end() };
  }
  if (options.dataDir) await mkdir(options.dataDir, { recursive: true });
  const client = options.dataDir ? new PGlite(`${options.dataDir}/pglite`) : new PGlite();
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migratePglite(db as never, { migrationsFolder: migrationsFolder() });
  return { db, kind: 'pglite', close: () => client.close() };
}
