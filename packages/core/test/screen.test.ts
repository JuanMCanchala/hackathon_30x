import { describe, expect, it } from 'vitest';
import { guessLang, mentions, screen, type ScreenCandidate, type ScreenOptions } from '../src';

const NOW = '2026-10-17T18:00:00.000Z';
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

const piece = (key: string, extra: Partial<ScreenCandidate> = {}): ScreenCandidate => ({
  key,
  platform: 'youtube',
  lang: 'en',
  text: 'How AI is changing business this year',
  publishedAt: hoursAgo(10),
  engagement: 100,
  authorMedian: null,
  ...extra,
});

const opts = (extra: Partial<ScreenOptions> = {}): ScreenOptions => ({
  now: NOW,
  langs: ['en', 'pt'],
  match: { en: ['business'], pt: ['negócios'] },
  windowHours: 72,
  budget: 10,
  seen: new Set(),
  ...extra,
});

describe('guessLang', () => {
  it('tells English, Portuguese and Spanish apart without a model', () => {
    expect(guessLang('How to use AI agents for your business and why it matters')).toBe('en');
    expect(guessLang('Como a inteligência artificial está mudando os negócios no Brasil')).toBe(
      'pt',
    );
    expect(guessLang('Cómo la inteligencia artificial cambia los negocios en Colombia')).toBe('es');
  });

  it('says it does not know when there is too little to go on', () => {
    expect(guessLang('ChatGPT 6')).toBeNull();
  });
});

describe('mentions', () => {
  it('matches whole words and phrases, ignoring case and accents', () => {
    expect(mentions('Os NEGOCIOS digitais em 2026', ['negócios'])).toBe('negócios');
    expect(mentions('AI for small business owners', ['small business'])).toBe('small business');
    expect(mentions('businesses', ['business'])).toBeNull();
  });
});

describe('screen', () => {
  it('stops each piece at the first rule it fails, with the reason in words', () => {
    const result = screen(
      [
        piece('es', { lang: 'es', text: 'Negocios con IA' }),
        piece('off', { text: 'A new model for protein folding' }),
        piece('old', { publishedAt: hoursAgo(24 * 9) }),
        piece('ok'),
      ],
      opts(),
    );
    const by = new Map(result.decisions.map((d) => [d.key, d]));
    expect(by.get('es')).toMatchObject({ pass: false, failed: 'idioma' });
    expect(by.get('es')!.reasons[0]).toBe('Está en español.');
    expect(by.get('off')).toMatchObject({ pass: false, failed: 'tema' });
    expect(by.get('old')).toMatchObject({ pass: false, failed: 'reciente' });
    expect(by.get('old')!.reasons[0]).toContain('9 días');
    expect(by.get('ok')).toMatchObject({ pass: true, failed: null, matched: 'business' });
    expect(result.funnel.map((f) => f.left)).toEqual([4, 3, 2, 1, 1, 1, 1]);
  });

  it("calls a piece viral at twice its author's median, or in the fastest quarter of its platform", () => {
    const result = screen(
      [
        piece('star', { engagement: 900, authorMedian: 300 }),
        piece('usual', { engagement: 310, authorMedian: 300 }),
        piece('fast', { engagement: 5_000 }),
        piece('slow1', { engagement: 50 }),
        piece('slow2', { engagement: 60 }),
      ],
      opts(),
    );
    const by = new Map(result.decisions.map((d) => [d.key, d]));
    expect(by.get('star')!.pass).toBe(true);
    expect(by.get('star')!.reasons).toContain('3× la mediana de su autor.');
    expect(by.get('fast')!.pass).toBe(true);
    expect(by.get('usual')).toMatchObject({ failed: 'viral' });
    expect(by.get('slow1')).toMatchObject({ failed: 'viral' });
  });

  it('skips what was already caught and spends tokens only within the budget, best first', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      piece(`p${i}`, { engagement: 100 * (i + 1), authorMedian: 10 }),
    );
    const result = screen(many, opts({ budget: 2, seen: new Set(['p5']) }));
    expect(result.caught.map((d) => d.key)).toEqual(['p4', 'p3']);
    const by = new Map(result.decisions.map((d) => [d.key, d]));
    expect(by.get('p5')).toMatchObject({ failed: 'nuevo' });
    expect(by.get('p0')).toMatchObject({ failed: 'presupuesto' });
  });

  it('does not call recent a piece whose date nobody knows', () => {
    const result = screen([piece('nodate', { dateKnown: false })], opts());
    expect(result.decisions[0]).toMatchObject({ pass: false, failed: 'reciente' });
    expect(result.decisions[0]!.reasons[0]).toBe('No se sabe cuándo se publicó.');
  });

  it('never calls viral a piece without public engagement', () => {
    const result = screen([piece('news', { platform: 'news', engagement: 0 })], opts());
    expect(result.decisions[0]).toMatchObject({ pass: false, failed: 'viral' });
  });
});

describe('screen with JEV', () => {
  const offText = piece('yt:off', { text: 'A new way to run your company with AI agents' });

  it('uses JEV for the topic when it judged the piece', () => {
    const r = screen([offText], opts({ judged: new Map([['yt:off', { onTopic: 0.82, fit: 8 }]]) }));
    const d = r.decisions[0]!;
    expect(d.pass).toBe(true);
    expect(d.reasons).toContain('JEV: es del tema (82 %).');
    expect(d.reasons).toContain('Encaje con 30X: 8/10 (JEV).');
    expect(d.fit).toBe(8);
  });

  it('JEV can reject a piece the keywords would pass', () => {
    const r = screen(
      [piece('yt:1')],
      opts({ judged: new Map([['yt:1', { onTopic: 0.2, fit: 5 }]]) }),
    );
    const d = r.decisions[0]!;
    expect(d.failed).toBe('tema');
    expect(d.reasons).toEqual(['JEV: solo lo menciona de paso (20 %).']);
  });

  it('falls back to keywords for pieces JEV did not judge', () => {
    const judged = new Map([['other', { onTopic: 0.9, fit: 9 }]]);
    const withJev = screen([offText, piece('yt:1')], opts({ judged }));
    const without = screen([offText, piece('yt:1')], opts());
    expect(withJev.decisions).toEqual(without.decisions);
  });

  it('ranks better fit first among caught', () => {
    const judged = new Map([
      ['yt:low', { onTopic: 0.9, fit: 3 }],
      ['yt:high', { onTopic: 0.9, fit: 9 }],
    ]);
    const r = screen([piece('yt:low'), piece('yt:high')], opts({ judged }));
    expect(r.caught.map((d) => d.key)).toEqual(['yt:high', 'yt:low']);
  });
});
