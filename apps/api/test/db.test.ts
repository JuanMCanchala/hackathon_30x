import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/db/client';
import { documents } from '../src/db/schema';

it('applies the migrations to an in-memory PGlite and round-trips document bytes', async () => {
  const { db, kind, close } = await openDatabase({});
  expect(kind).toBe('pglite');
  const bytes = Buffer.from([0, 1, 2, 255]);
  await db.insert(documents).values({
    sha256: 'abc',
    orgId: 'altamar',
    filename: 'a.pdf',
    mime: 'application/pdf',
    channel: 'pdf',
    text: 'hola',
    bytes,
  });
  const [row] = await db.select().from(documents).where(eq(documents.sha256, 'abc'));
  expect(Buffer.from(row!.bytes)).toEqual(bytes);
  await close();
});
