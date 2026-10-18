import { describe, expect, it } from 'vitest';
import { languageLag, type LanguageLagFile } from '../src';

const article = (title: string, created: string, peak: string | null) => ({
  title,
  created,
  peak: peak ? { date: peak, views: 1000 } : null,
});

const file: LanguageLagFile = {
  fetchedAt: '2026-10-17T22:00:00Z',
  waves: [
    {
      id: 'vibe-coding',
      name: 'Vibe coding',
      event: '2025-02-02',
      specific: true,
      en: article('Vibe coding', '2025-03-10T08:00:00Z', '2025-03-20'),
      es: article('Vibe coding', '2025-04-09T20:00:00Z', '2025-03-27'),
    },
    {
      id: 'gpt-5',
      name: 'GPT-5',
      event: '2025-08-07',
      specific: true,
      en: article('GPT-5', '2025-08-01T00:00:00Z', '2025-08-08'),
      es: article('GPT-5', '2025-08-11T00:00:00Z', '2025-08-08'),
    },
    {
      // A redirect to an article older than the wave: its creation says nothing about the wave.
      id: 'claude-code',
      name: 'Claude Code',
      event: '2025-05-22',
      specific: false,
      en: article('Claude (AI)', '2023-03-14T00:00:00Z', '2025-05-23'),
      es: article('Claude (chatbot)', '2023-07-01T00:00:00Z', '2025-05-30'),
    },
    {
      id: 'genie-3',
      name: 'Genie 3',
      event: '2025-08-05',
      specific: true,
      en: article('Genie (world model)', '2025-08-06T00:00:00Z', '2025-08-06'),
      es: null,
    },
  ],
};

describe('how long AI waves take to reach Spanish Wikipedia', () => {
  it('measures creation lag on the wave’s own articles and peak lag wherever both exist', () => {
    const lag = languageLag(file);
    const byId = Object.fromEntries(lag.waves.map((w) => [w.id, w]));
    expect(byId['vibe-coding']).toMatchObject({
      createdLagDays: 30,
      peakLagDays: 7,
      inSpanish: true,
    });
    expect(byId['gpt-5']).toMatchObject({ createdLagDays: 10, peakLagDays: 0 });
    expect(byId['claude-code']).toMatchObject({ createdLagDays: null, peakLagDays: 7 });
    expect(byId['genie-3']).toMatchObject({
      createdLagDays: null,
      peakLagDays: null,
      inSpanish: false,
    });
    expect(lag.medianCreatedLagDays).toBe(20);
    expect(lag.medianPeakLagDays).toBe(7);
    expect(lag.counted).toEqual({ created: 2, peak: 3, waves: 4, notInSpanish: 1 });
  });

  it('says nothing rather than zero when no wave can be measured', () => {
    const lag = languageLag({ fetchedAt: null, waves: [] });
    expect(lag.medianCreatedLagDays).toBeNull();
    expect(lag.medianPeakLagDays).toBeNull();
  });
});
