/**
 * The technical lane, where AI waves usually form first: Hacker News, GitHub, Hugging Face and
 * arXiv. Likes hold points, stars and upvotes so that every platform reads the same way.
 */
import * as cheerio from 'cheerio';
import type { RawItem } from '@radar/core';
import type { Parser } from '../types';
import { readFeed } from './feeds';
import { compact, num, parseCount, str, stripHtml, toIso, truncate } from '../util';

interface HnHit {
  objectID?: string;
  title?: string;
  url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  created_at_i?: number;
  story_text?: string;
}

export const parseHn: Parser = (body, record) => {
  let data: { hits?: HnHit[] };
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  return (data.hits ?? [])
    .filter((h) => h.objectID && h.title)
    .map((h) =>
      compact<RawItem>({
        platform: 'hn',
        source: 'hn-algolia',
        externalId: h.objectID!,
        url: str(h.url) ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: {
          id: h.author ?? '',
          name: h.author ?? '',
          handle: h.author,
          url: h.author ? `https://news.ycombinator.com/user?id=${h.author}` : undefined,
        },
        publishedAt: toIso(h.created_at_i) ?? toIso(h.created_at) ?? record.capturedAt,
        title: h.title,
        text: [h.title, truncate(stripHtml(h.story_text), 800)].filter(Boolean).join('\n'),
        format: 'article',
        lang: 'en',
        metrics: compact({ likes: num(h.points), comments: num(h.num_comments) }),
        capturedAt: record.capturedAt,
        query: str(record.meta.query),
      }),
    );
};

interface GithubRepo {
  id?: number;
  full_name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  created_at?: string;
  topics?: string[];
  language?: string | null;
  owner?: { login?: string; html_url?: string };
}

function repoItem(repo: GithubRepo, capturedAt: string, query?: string): RawItem | undefined {
  if (!repo.full_name) return undefined;
  const owner = repo.owner?.login ?? repo.full_name.split('/')[0]!;
  const topics = repo.topics?.length ? `Temas: ${repo.topics.join(', ')}` : '';
  return compact<RawItem>({
    platform: 'github',
    source: 'github-search',
    externalId: repo.full_name.toLowerCase(),
    url: repo.html_url ?? `https://github.com/${repo.full_name}`,
    author: compact({
      id: owner.toLowerCase(),
      name: owner,
      handle: owner,
      url: repo.owner?.html_url ?? `https://github.com/${owner}`,
    }),
    publishedAt: toIso(repo.created_at) ?? capturedAt,
    title: repo.full_name,
    text: [repo.full_name, repo.description ?? '', topics].filter(Boolean).join('\n'),
    format: 'repo',
    metrics: compact({ likes: num(repo.stargazers_count), shares: num(repo.forks_count) }),
    capturedAt,
    query,
  });
}

/**
 * Search API results and the weekly trending page.
 *
 * Trending repos keep the same convention as search (likes = total stars, shares = forks). The
 * page's "N stars this week" has no metric of its own: it goes on the last line of the text as
 * "+N estrellas esta semana", and the snapshots in `item_metrics` measure the speed anyway.
 * Trending gives no creation date, so `publishedAt` is the capture time, marked approximate.
 */
export const parseGithub: Parser = (body, record) => {
  if (record.key.startsWith('trending')) {
    const $ = cheerio.load(body);
    const items: RawItem[] = [];
    $('article.Box-row').each((_, el) => {
      const row = $(el);
      const href = row.find('h2 a').attr('href')?.trim() ?? '';
      const fullName = href.replace(/^\//, '');
      if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) return;
      const owner = fullName.split('/')[0]!;
      const description = row.find('p').first().text().replace(/\s+/g, ' ').trim();
      const language = row.find('[itemprop="programmingLanguage"]').text().trim();
      const stars = parseCount(row.find(`a[href="/${fullName}/stargazers"]`).text());
      const forks = parseCount(row.find(`a[href="/${fullName}/forks"]`).text());
      const weekly = row
        .find('span')
        .toArray()
        .map((s) => $(s).text().replace(/\s+/g, ' ').trim())
        .find((t) => /stars? this week/i.test(t));
      const weeklyStars = parseCount(weekly);
      items.push(
        compact<RawItem>({
          platform: 'github',
          source: 'github-trending',
          externalId: fullName.toLowerCase(),
          url: `https://github.com/${fullName}`,
          author: {
            id: owner.toLowerCase(),
            name: owner,
            handle: owner,
            url: `https://github.com/${owner}`,
          },
          publishedAt: record.capturedAt,
          publishedApprox: true,
          title: fullName,
          text: [
            fullName,
            description,
            language ? `Lenguaje: ${language}` : '',
            weeklyStars !== undefined ? `+${weeklyStars} estrellas esta semana` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          format: 'repo',
          metrics: compact({ likes: stars, shares: forks }),
          capturedAt: record.capturedAt,
        }),
      );
    });
    return items;
  }
  let data: { items?: GithubRepo[] };
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const query = str(record.meta.query);
  return (data.items ?? [])
    .map((repo) => repoItem(repo, record.capturedAt, query))
    .filter((item): item is RawItem => item !== undefined);
};

interface HfRepo {
  id?: string;
  likes?: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
  tags?: string[];
  sdk?: string;
  createdAt?: string;
}

interface HfPaper {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    upvotes?: number;
    publishedAt?: string;
    ai_keywords?: string[];
    authors?: { name?: string }[];
  };
  title?: string;
  summary?: string;
  numComments?: number;
  publishedAt?: string;
  submittedBy?: { name?: string; fullname?: string };
}

/** Tags that only describe the file format, license or region say nothing about the topic. */
const NOISE_TAG =
  /^(license:|region:|endpoints_compatible|safetensors|gguf|transformers|arxiv:|base_model:|dataset:|autotrain|text-generation-inference|custom_code|diffusers:|has_space|deploy:)/;

export const parseHuggingface: Parser = (body, record) => {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  if (record.key === 'papers') {
    return (data as HfPaper[])
      .filter((p) => p.paper?.id)
      .map((p) => {
        const paper = p.paper!;
        const title = p.title ?? paper.title ?? '';
        const keywords = paper.ai_keywords?.length
          ? `Palabras clave: ${paper.ai_keywords.join(', ')}`
          : '';
        const first = paper.authors?.[0]?.name;
        return compact<RawItem>({
          platform: 'huggingface',
          source: 'huggingface-papers',
          externalId: `paper:${paper.id}`,
          url: `https://huggingface.co/papers/${paper.id}`,
          author: { id: first ?? 'huggingface-papers', name: first ?? 'Hugging Face Papers' },
          publishedAt: toIso(paper.publishedAt) ?? toIso(p.publishedAt) ?? record.capturedAt,
          title,
          text: [title, truncate(p.summary ?? paper.summary ?? '', 700), keywords]
            .filter(Boolean)
            .join('\n'),
          format: 'paper',
          lang: 'en',
          metrics: compact({ likes: num(paper.upvotes), comments: num(p.numComments) }),
          capturedAt: record.capturedAt,
        });
      });
  }
  const isSpace = record.key === 'spaces';
  return (data as HfRepo[])
    .filter((m) => m.id)
    .map((m) => {
      const id = m.id!;
      const org = id.includes('/') ? id.split('/')[0]! : id;
      const tags = (m.tags ?? []).filter((t) => !NOISE_TAG.test(t)).slice(0, 12);
      return compact<RawItem>({
        platform: 'huggingface',
        source: isSpace ? 'huggingface-spaces' : 'huggingface-models',
        externalId: `${isSpace ? 'space' : 'model'}:${id}`,
        url: `https://huggingface.co/${isSpace ? 'spaces/' : ''}${id}`,
        author: {
          id: org.toLowerCase(),
          name: org,
          handle: org,
          url: `https://huggingface.co/${org}`,
        },
        publishedAt: toIso(m.createdAt) ?? record.capturedAt,
        title: id,
        text: [
          id,
          m.pipeline_tag ?? m.sdk ?? '',
          tags.length ? `Etiquetas: ${tags.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        format: 'model',
        metrics: compact({ likes: num(m.likes), views: num(m.downloads) }),
        capturedAt: record.capturedAt,
      });
    });
};

export const parseArxiv: Parser = (body, record) => {
  const feed = readFeed(body);
  return feed.entries
    .filter((e) => e.url && e.title)
    .map((e) => {
      const id = e.id.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
      return compact<RawItem>({
        platform: 'arxiv',
        source: 'arxiv-api',
        externalId: id,
        url: e.url,
        author: { id: e.author ?? 'arxiv', name: e.author ?? 'arXiv' },
        publishedAt: e.publishedAt ?? record.capturedAt,
        title: e.title,
        text: [e.title, truncate(e.summary, 700)].filter(Boolean).join('\n'),
        format: 'paper',
        lang: 'en',
        metrics: {},
        capturedAt: record.capturedAt,
        query: str(record.meta.category),
      });
    });
};
