/**
 * «Maquetas»: the post designs the team's designers build once and reuse, like a Canva template.
 * A maqueta holds the look (colors, type, texture, brand) and the text of every slide; the
 * calendar schedules a piece with one and shows its current design.
 */
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { maquetas } from '../db/schema';
import { conflict, iso, newId, notFound } from '../lib/common';
import { nowIso, type Deps } from './deps';
import { cameWithDemo, importedAt } from './snapshot';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const MaquetaStyleSchema = z.object({
  preset: z.string().max(40),
  bg: Hex,
  ink: Hex,
  accent: Hex,
  soft: Hex,
  font: z.enum(['hanken', 'mono']),
  headline: z.enum(['grueso', 'fino']),
  align: z.enum(['izquierda', 'centro']),
  texture: z.enum(['ninguna', 'ondas', 'cuadricula', 'avion']),
  brand: z.object({ name: z.string().max(40), handle: z.string().max(40), logo: z.boolean() }),
});

export const MaquetaSlideSchema = z.object({
  layout: z.enum(['portada', 'titular', 'cifra', 'cita', 'lista', 'cierre']),
  kicker: z.string().max(80).default(''),
  title: z.string().max(200),
  body: z.string().max(700).default(''),
});

/** What it was drafted from: a topic and its adaptation, or a piece Vigía caught. */
export const MaquetaOriginSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('topic'),
    topicId: z.string().max(80),
    adaptationId: z.string().max(80).nullable(),
    name: z.string().max(120),
  }),
  z.object({
    kind: z.literal('vigia'),
    watchId: z.string().max(80),
    itemId: z.string().max(300),
    name: z.string().max(120),
  }),
]);

export const MaquetaBody = z.object({
  name: z.string().trim().min(1).max(80),
  format: z.enum(['carrusel', 'post', 'historia', 'portada']),
  style: MaquetaStyleSchema,
  slides: z.array(MaquetaSlideSchema).min(1).max(12),
  origin: MaquetaOriginSchema.nullable().default(null),
  basedOn: z.string().max(80).nullable().default(null),
});

export type MaquetaInput = z.infer<typeof MaquetaBody>;
export type MaquetaSlide = z.infer<typeof MaquetaSlideSchema>;
export type MaquetaOrigin = z.infer<typeof MaquetaOriginSchema>;

export interface MaquetaView extends MaquetaInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** False for the demo week's own maquetas: only an admin changes those. */
  removable: boolean;
}

/** Plenty for a team's designs, and a bound on what visitors of the public demo can store. */
export const MAX_MAQUETAS = 300;

/** `loadedAt`: when the demo week was loaded, from importedAt(). */
export function maquetaView(
  row: typeof maquetas.$inferSelect,
  loadedAt: number | null,
): MaquetaView {
  return {
    id: row.id,
    name: row.name,
    format: row.format as MaquetaInput['format'],
    style: row.style as MaquetaInput['style'],
    slides: row.slides as MaquetaSlide[],
    origin: (row.origin ?? null) as MaquetaOrigin | null,
    basedOn: row.basedOn,
    // Timestamp columns read back as Postgres text, which Safari cannot parse.
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    removable: !cameWithDemo(row.createdAt, loadedAt),
  };
}

const changed = (deps: Deps, id: string) =>
  deps.bus.publish({ type: 'maqueta.changed', at: nowIso(deps), data: { id } });

/** The most recently edited first. */
export async function listMaquetas(deps: Deps): Promise<MaquetaView[]> {
  const rows = await deps.db.select().from(maquetas).orderBy(desc(maquetas.updatedAt));
  const loadedAt = await importedAt(deps);
  return rows.map((r) => maquetaView(r, loadedAt));
}

export async function getMaqueta(deps: Deps, id: string): Promise<MaquetaView> {
  const [row] = await deps.db.select().from(maquetas).where(eq(maquetas.id, id));
  if (!row) throw notFound('La maqueta');
  return maquetaView(row, await importedAt(deps));
}

export async function createMaqueta(deps: Deps, input: MaquetaInput): Promise<MaquetaView> {
  const [stored] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(maquetas);
  if ((stored?.n ?? 0) >= MAX_MAQUETAS)
    throw conflict(`Ya hay ${MAX_MAQUETAS} maquetas guardadas. Borra alguna para crear otra.`);
  const now = nowIso(deps);
  const row = { id: newId('mqt'), ...input, createdAt: now, updatedAt: now };
  await deps.db.insert(maquetas).values(row);
  changed(deps, row.id);
  return maquetaView(row, await importedAt(deps));
}

/** Replaces the design and its slides; the calendar shows the new look on its pieces. */
export async function updateMaqueta(
  deps: Deps,
  id: string,
  input: MaquetaInput,
): Promise<MaquetaView> {
  const [row] = await deps.db
    .update(maquetas)
    .set({ ...input, updatedAt: nowIso(deps) })
    .where(eq(maquetas.id, id))
    .returning();
  if (!row) throw notFound('La maqueta');
  changed(deps, id);
  return maquetaView(row, await importedAt(deps));
}

/** The calendar keeps the pieces scheduled with it, with their text and no design. */
export async function deleteMaqueta(deps: Deps, id: string) {
  const deleted = await deps.db
    .delete(maquetas)
    .where(eq(maquetas.id, id))
    .returning({ id: maquetas.id });
  if (!deleted.length) throw notFound('La maqueta');
  changed(deps, id);
  return { ok: true };
}

/**
 * A maqueta the demo week came with (made before its snapshot was loaded). Visitors change the
 * ones they made; only an admin changes these.
 */
export async function isDemoMaqueta(deps: Deps, id: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ createdAt: maquetas.createdAt })
    .from(maquetas)
    .where(eq(maquetas.id, id));
  return !!row && cameWithDemo(row.createdAt, await importedAt(deps));
}
