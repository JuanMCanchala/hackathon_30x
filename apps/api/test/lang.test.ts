import { describe, expect, it } from 'vitest';
import { guessLang } from '@radar/core';
import { langOf } from '../src/lib/lang';

describe('the language of a piece', () => {
  it('trusts the language the platform reports first', () => {
    expect(langOf({ lang: 'pt-BR', text: 'How AI agents change small business' })).toBe('pt');
  });

  it('reads short texts that the word list cannot tell apart', () => {
    const text = 'Machine learning tips for product managers';
    expect(guessLang(text)).toBeNull();
    expect(langOf({ text })).toBe('en');
    expect(langOf({ text: 'Inteligência artificial nas empresas brasileiras' })).toBe('pt');
    expect(langOf({ text: 'Inteligencia artificial en las empresas colombianas' })).toBe('es');
  });

  it('says it cannot tell rather than guess on names and numbers', () => {
    expect(langOf({ text: 'ChatGPT 6' })).toBeNull();
  });
});
