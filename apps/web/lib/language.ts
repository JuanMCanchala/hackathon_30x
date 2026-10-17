import { fmtInt } from '@/components/ui';
import { LANG_COPY, type RadarTopic } from './types';

const weeksOf = (days: number | null) => (days ? Math.round(days / 7) : 0);
const weeksCopy = (n: number) => (n === 1 ? 'una semana' : `${n} semanas`);

/**
 * «51 creadores en inglés esta semana; nadie todavía en español. El inglés va 3 semanas por
 * delante.» Where a topic comes from and how far behind Spanish is. Null without a leader.
 */
export function windowLine(t: RadarTopic): string | null {
  const w = t.spanishWindow;
  if (!w.leader) return null;
  const from = LANG_COPY[w.leader].toLowerCase();
  const lead = t.languages[w.leader].creators;
  const es = t.languages.es.creators;
  const weeks = weeksOf(w.lagDays);
  const ahead = weeks ? ` El ${from} va ${weeksCopy(weeks)} por delante.` : '';
  return `${fmtInt(lead)} creadores en ${from} esta semana; ${es === 0 ? 'nadie todavía' : `solo ${fmtInt(es)}`} en español.${ahead}`;
}

/** The topic page's reading of its three waves, in one or two sentences. */
export function languageStory(t: RadarTopic): string {
  const w = t.spanishWindow;
  const { en, pt, es } = t.languages;
  if (w.leader) {
    const from = LANG_COPY[w.leader].toLowerCase();
    if (!w.open)
      return `En ${from} lo publican ${fmtInt(t.languages[w.leader].creators)} creadores y en español ya ${fmtInt(es.creators)}: llegar primero ya no es posible, pero sí con un ángulo propio.`;
    return `${windowLine(t)} ${
      es.creators <= 2
        ? 'Es la ventana para contarlo primero en español: la idea ya probó que funciona.'
        : `En español todavía no llega a la cuarta parte que en ${from}: hay espacio para adaptarlo antes de que se llene.`
    }`;
  }
  if (es.creators > Math.max(en.creators, pt.creators))
    return 'Este tema se mueve sobre todo en español: aquí no hay nada que traer de otro idioma.';
  return 'Todavía es pequeño en los tres idiomas: ninguno le lleva ventaja a los demás.';
}
