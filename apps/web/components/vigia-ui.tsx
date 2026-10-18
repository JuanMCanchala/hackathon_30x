/**
 * Small pieces the Vigía screen shares: button styles from the mockup (dark and outlined
 * rectangles), relative time and the EN/PT badge.
 */
import clsx from 'clsx';
import { WATCH_LANG_COPY, type WatchLang } from '@/lib/types';

/** The mockup's dark rectangular button: «Seguir», «Adaptar». */
export const darkBtn =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-ink px-4 text-[0.92rem] font-[650] text-sheet transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/** The outlined twin: «Ver original ↗». */
export const outlineBtn =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-rule-strong bg-sheet px-4 text-[0.92rem] font-[600] text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50';

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function ago(iso: string): string {
  const minutes = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `hace ${Math.round(minutes / 60)} h`;
  return `hace ${Math.round(minutes / 1440)} días`;
}

/** The piece's language as a small solid badge. */
export function LangBadge({ lang }: { lang: WatchLang }) {
  return (
    <span
      className={clsx(
        'inline-block rounded-[5px] px-1.5 text-[0.68rem] leading-[1.15rem] font-[760] text-white',
        lang === 'pt' ? 'bg-lang-pt' : lang === 'hi' ? 'bg-st-saturado' : 'bg-lang-en',
      )}
      title={WATCH_LANG_COPY[lang]}
    >
      {lang.toUpperCase()}
    </span>
  );
}
