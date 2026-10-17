/**
 * The community as a sensor (one of the paths the brief suggests): anyone on the team sends a
 * public post they saw working, the radar reads its public page, labels it and adds it to its
 * topic, and every screen updates. Nobody logs in anywhere for it.
 */
import { desc, eq } from 'drizzle-orm';
import { readPublicPost } from '@radar/sources';
import { enrichments, items, itemTopics, sensorSubmissions, topics } from '../db/schema';
import { AppError, newId } from '../lib/common';
import { clusterLabels } from '../pipeline/cluster';
import { enrichItems } from '../pipeline/enrich';
import { saveItems } from '../pipeline/ingest';
import type { Deps } from './deps';

/** Page titles carry the network's own suffixes: «… | Google DeepMind han publicado acerca del tema | LinkedIn». */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')
    .replace(
      /\s*\|\s*[^|]*(han publicado acerca del tema|ha publicado acerca del tema|posted on the topic)[^|]*$/i,
      '',
    )
    .trim();
}

/** LinkedIn's page title names the author when the parsed post does not: «… | Google DeepMind han publicado…». */
function authorFromTitle(title: string | undefined): string | null {
  const match = title?.match(/\|\s*([^|]+?)\s+(?:han|ha) publicado acerca del tema/i);
  return match?.[1]?.trim() ?? null;
}

const ALLOWED =
  /^(www\.|m\.)?(linkedin\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|bsky\.app)$/;

export async function submitPost(
  deps: Deps,
  input: { url: string; submittedBy: string; note?: string },
) {
  let url: URL;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw new AppError(400, 'bad_url', 'Ese enlace no es válido.');
  }
  if (url.protocol !== 'https:' || !ALLOWED.test(url.hostname)) {
    throw new AppError(
      400,
      'unsupported_url',
      'Por ahora el sensor lee posts públicos de LinkedIn, Instagram, TikTok, YouTube, X y Bluesky.',
    );
  }
  const id = newId('sns');
  const now = deps.clock.now().toISOString();
  const item = await readPublicPost(url.toString()).catch(() => null);
  if (!item) {
    await deps.db.insert(sensorSubmissions).values({
      id,
      url: url.toString(),
      itemId: null,
      submittedBy: input.submittedBy,
      note: input.note ?? null,
      status: 'unreadable',
      createdAt: now,
    });
    throw new AppError(
      422,
      'unreadable',
      'No pudimos leer ese post: puede ser privado o la red no lo muestra sin sesión.',
    );
  }
  const author = item.author.name
    ? item.author
    : { ...item.author, name: authorFromTitle(item.title) ?? item.author.handle ?? '' };
  await saveItems(deps, [{ ...item, author, capturedAt: now }], true);
  const itemId = `${item.platform}:${item.externalId}`;
  await enrichItems(deps, [itemId]);
  await clusterLabels(deps);
  await deps.db.insert(sensorSubmissions).values({
    id,
    url: url.toString(),
    itemId,
    submittedBy: input.submittedBy,
    note: input.note ?? null,
    status: 'added',
    createdAt: now,
  });
  const linked = await deps.db
    .select({ id: topics.id, name: topics.name })
    .from(itemTopics)
    .innerJoin(topics, eq(topics.id, itemTopics.topicId))
    .where(eq(itemTopics.itemId, itemId));
  const title = cleanTitle(item.title || item.text.slice(0, 90));
  deps.bus.publish({ type: 'sensor.received', at: now, data: { id, itemId, title } });
  return { id, itemId, platform: item.platform, title, topics: linked };
}

export async function submissions(deps: Deps) {
  const rows = await deps.db
    .select({ s: sensorSubmissions, item: items, e: enrichments })
    .from(sensorSubmissions)
    .leftJoin(items, eq(items.id, sensorSubmissions.itemId))
    .leftJoin(enrichments, eq(enrichments.itemId, sensorSubmissions.itemId))
    .orderBy(desc(sensorSubmissions.createdAt))
    .limit(50);
  const links = await deps.db
    .select({ itemId: itemTopics.itemId, id: topics.id, name: topics.name })
    .from(itemTopics)
    .innerJoin(topics, eq(topics.id, itemTopics.topicId));
  const seen = new Set<string>();
  const latest = rows.filter(({ s }) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  return latest.map(({ s, item, e }) => ({
    id: s.id,
    url: s.url,
    submittedBy: s.submittedBy,
    note: s.note,
    status: s.status,
    createdAt: s.createdAt,
    piece: item
      ? {
          id: item.id,
          platform: item.platform,
          authorName: item.authorName,
          title: cleanTitle(item.title || item.text.slice(0, 140)),
          likes: item.likes,
          comments: item.comments,
          views: item.views,
          hook: e?.hook ?? null,
        }
      : null,
    topics: links.filter((l) => l.itemId === s.itemId).map((l) => ({ id: l.id, name: l.name })),
  }));
}
