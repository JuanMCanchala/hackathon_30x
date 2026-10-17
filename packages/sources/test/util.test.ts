import { describe, expect, it } from 'vitest';
import {
  extractAssignedJson,
  parseCount,
  parseDuration,
  parseRelativeTime,
  stripHtml,
} from '../src/util';

describe('parseCount', () => {
  it.each([
    ['108,995 vistas', 108_995],
    ['165,673 views', 165_673],
    ['14.601 seguidores', 14_601],
    ['11.969.466 seguidores', 11_969_466],
    ['2.3 mil vistas', 2_300],
    ['1,2 M de vistas', 1_200_000],
    ['1,5 millones de vistas', 1_500_000],
    ['82K views', 82_000],
    ['1.2M views', 1_200_000],
    ['108 k', 108_000],
    ['42 vistas', 42],
    ['No views', 0],
    ['Sin vistas', 0],
  ])('%s → %d', (text, expected) => {
    expect(parseCount(text)).toBe(expected);
  });

  it('has no number in an empty or wordy text', () => {
    expect(parseCount('')).toBeUndefined();
    expect(parseCount('vistas')).toBeUndefined();
    expect(parseCount(undefined)).toBeUndefined();
  });
});

describe('parseRelativeTime', () => {
  const now = '2026-10-17T12:00:00.000Z';
  it.each([
    ['hace 1 día', '2026-10-16T12:00:00.000Z'],
    ['hace 21 h', '2026-10-16T15:00:00.000Z'],
    ['hace 3 horas', '2026-10-17T09:00:00.000Z'],
    ['Transmitido hace 4 días', '2026-10-13T12:00:00.000Z'],
    ['hace 2 semanas', '2026-10-03T12:00:00.000Z'],
    ['4d ago', '2026-10-13T12:00:00.000Z'],
    ['2h ago', '2026-10-17T10:00:00.000Z'],
    ['1 day ago', '2026-10-16T12:00:00.000Z'],
    ['Streamed 3 hours ago', '2026-10-17T09:00:00.000Z'],
    ['5 minutes ago', '2026-10-17T11:55:00.000Z'],
  ])('%s', (text, expected) => {
    expect(parseRelativeTime(text, now)).toBe(expected);
  });

  it('gives up on text without an amount and a unit', () => {
    expect(parseRelativeTime('ayer', now)).toBeUndefined();
    expect(parseRelativeTime('hace 3 lunas', now)).toBeUndefined();
  });
});

describe('parseDuration', () => {
  it('reads minutes and hours', () => {
    expect(parseDuration('9:24')).toBe(564);
    expect(parseDuration('1:11:21')).toBe(4281);
    expect(parseDuration('0:45')).toBe(45);
    expect(parseDuration('LIVE')).toBeUndefined();
  });
});

describe('stripHtml', () => {
  it('keeps the text and line breaks, decodes entities', () => {
    expect(stripHtml('<p>Hola &amp; <b>adiós</b></p><p>Dos&#33;</p>')).toBe('Hola & adiós\nDos!');
  });
});

describe('extractAssignedJson', () => {
  it('finds the object even with braces inside strings', () => {
    const html = '<script>var ytInitialData = {"a":"}{","b":{"c":1}};var x = 2;</script>';
    expect(extractAssignedJson(html, 'var ytInitialData')).toEqual({ a: '}{', b: { c: 1 } });
  });

  it('is undefined when the variable is missing', () => {
    expect(extractAssignedJson('<html></html>', 'var ytInitialData')).toBeUndefined();
  });
});
