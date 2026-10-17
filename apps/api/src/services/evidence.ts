/**
 * Evidence of delivered work: new items are stored, and the vendor's open bills are decided again
 * with them. Evidence never pays anything by itself; the engine decides what it proves.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Decision, EvidenceItem } from '@recibido/domain';
import { stableJson } from '../llm/cache';
import { bills, evidenceItems } from '../db/schema';
import { reevaluateIfOpen } from './bills';
import { withOrgLock } from './lock';
import {
  addTimeline,
  allEvidence,
  allVendors,
  ORG_ID,
  REOPENED,
  ServiceError,
  sha256Hex,
  type Deps,
} from './state';

/** Stores new or changed items; returns the vendors whose evidence changed. */
export async function upsertEvidence(deps: Deps, items: EvidenceItem[]): Promise<string[]> {
  return withOrgLock(async () => {
    const now = await deps.clock.now();
    return deps.db.transaction(async (tx) => {
      const changed = new Set<string>();
      for (const item of items) {
        const [row] = await tx.select().from(evidenceItems).where(eq(evidenceItems.id, item.id));
        if (row && stableJson(row.data) === stableJson(item)) continue;
        if (row && row.vendorId !== item.vendorId)
          throw new ServiceError(409, `La evidencia ${item.id} pertenece a otro proveedor.`);
        if (row)
          await tx
            .update(evidenceItems)
            .set({ data: item, updatedAt: now })
            .where(eq(evidenceItems.id, item.id));
        else
          await tx.insert(evidenceItems).values({
            id: item.id,
            orgId: ORG_ID,
            vendorId: item.vendorId,
            data: item,
            updatedAt: now,
          });
        await addTimeline(tx, now, 'evidence', null, `Nueva evidencia: ${item.title}.`);
        changed.add(item.vendorId);
      }
      return [...changed];
    });
  });
}

/** Re-decides the vendor's bills that wait on the vendor or on evidence. */
export async function reevaluateVendor(
  deps: Deps,
  vendorId: string,
): Promise<{ billId: string; decision: Decision }[]> {
  const open = await deps.db
    .select({ id: bills.id })
    .from(bills)
    .where(and(eq(bills.vendorId, vendorId), inArray(bills.status, REOPENED)));
  const out = [];
  for (const { id } of open) {
    const decision = await reevaluateIfOpen(deps, id);
    if (decision) out.push({ billId: id, decision });
  }
  return out;
}

/** Stores the items and re-decides the open bills of every vendor they touch. */
export async function addEvidence(deps: Deps, items: EvidenceItem[]): Promise<string[]> {
  const vendorIds = await upsertEvidence(deps, items);
  for (const vendorId of vendorIds) await reevaluateVendor(deps, vendorId);
  return vendorIds;
}

/** A person accepts a pending deliverable (Lina accepting the Brand kit v2). */
export async function acceptDeliverable(
  deps: Deps,
  deliverableId: string,
  actor: string,
): Promise<EvidenceItem> {
  const pending = (await allEvidence(deps.db)).find(
    (e) => e.source === 'entregables' && e.ref === deliverableId,
  );
  if (!pending) throw new ServiceError(404, 'El entregable no existe.');
  if (pending.kind === 'deliverable_accepted') return pending;
  const accepted: EvidenceItem = {
    ...pending,
    kind: 'deliverable_accepted',
    actor,
    occurredAt: await deps.clock.now(),
  };
  await addEvidence(deps, [accepted]);
  return accepted;
}

const HEADER = ['fecha', 'proveedor', 'proyecto', 'minutos', 'descripcion'];
const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z))?$/;

const unquote = (s: string) =>
  s
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/""/g, '"');

/**
 * Time entries exported from a time tracker: `fecha,proveedor,proyecto,minutos,descripcion`.
 * `proveedor` is the vendor id or name; the description may contain commas.
 */
export async function importTimeEntriesCsv(
  deps: Deps,
  csv: string,
): Promise<{ imported: number; vendorIds: string[] }> {
  const lines = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  const header = (lines.shift() ?? '').split(',').map((h) => unquote(h).toLowerCase());
  if (HEADER.some((h, i) => header[i] !== h))
    throw new ServiceError(400, `El CSV debe tener las columnas ${HEADER.join(',')}.`);
  const vendors = await allVendors(deps.db);
  const items: EvidenceItem[] = lines.map((line, i) => {
    const [fecha = '', proveedor = '', proyecto = '', minutos = '', ...rest] = line.split(',');
    const row = i + 2;
    const who = unquote(proveedor).toLowerCase();
    const vendor = vendors.find((v) => v.id === who || v.name.toLowerCase() === who);
    const date = unquote(fecha);
    const minutes = Number(unquote(minutos));
    if (!vendor) throw new ServiceError(400, `Fila ${row}: proveedor desconocido.`);
    if (!DATE.test(date)) throw new ServiceError(400, `Fila ${row}: fecha inválida.`);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60)
      throw new ServiceError(400, `Fila ${row}: minutos inválidos.`);
    if (!unquote(proyecto)) throw new ServiceError(400, `Fila ${row}: falta el proyecto.`);
    return {
      id: `csv-${sha256Hex(line).slice(0, 16)}`,
      vendorId: vendor.id,
      source: 'toggl',
      origin: 'csv',
      kind: 'time_entry',
      ref: unquote(proyecto),
      title: unquote(rest.join(',')) || 'Registro de tiempo',
      url: null,
      occurredAt: date.length === 10 ? `${date}T18:00:00-05:00` : date,
      minutes,
    };
  });
  return { imported: items.length, vendorIds: await addEvidence(deps, items) };
}
