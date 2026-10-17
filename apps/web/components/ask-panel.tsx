'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { ArrowUp, Loader2, MessageCircleQuestion, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { TopicDetail } from '@/lib/types';

interface Answer {
  answer: string;
  /** What each figure came from: a topic or a piece, with where to open it. */
  refs: { ref: string; label: string; href: string; external: boolean }[];
  followUps: string[];
}

interface Turn {
  question: string;
  answer?: Answer;
  error?: string;
}

const STARTERS = [
  '¿Qué tema de IA para ventas está creciendo esta semana?',
  '¿Qué está despegando que 30X todavía no ha tocado?',
  '¿Qué formato funciona mejor esta semana en LinkedIn?',
  '¿Qué le funciona a Andrés Bilbao en Instagram?',
];

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** The shortcut as this keyboard writes it. */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (isMac() ? '⌘K' : 'Ctrl K'),
    () => '⌘K',
  );
}

/** The question box in the top bar: opens the conversation, also with ⌘K or Ctrl+K. */
export function AskTrigger({ onOpen }: { onOpen: () => void }) {
  const shortcut = useShortcutLabel();
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="hidden h-10 w-[300px] items-center gap-2.5 rounded-full bg-white/10 pr-2 pl-3.5 text-left text-[0.92rem] text-white/75 transition hover:bg-white/15 hover:text-white md:flex"
      >
        <MessageCircleQuestion className="size-[1.1rem] shrink-0 text-marker" aria-hidden />
        <span className="flex-1 truncate">Pregúntale al radar</span>
        <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-sans text-[0.75rem] font-[600] text-white/80">
          {shortcut}
        </kbd>
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Pregúntale al radar"
        className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10 md:hidden"
      >
        <MessageCircleQuestion className="size-5" aria-hidden />
      </button>
    </>
  );
}

/** Questions about the topic on screen come first when the conversation opens from one. */
function useStarters(open: boolean): string[] {
  const pathname = usePathname();
  const id = pathname.match(/^\/tema\/([\w-]+)/)?.[1];
  const { data } = useApi<TopicDetail>(open && id ? `/api/v1/topics/${id}` : null);
  if (!data) return STARTERS;
  const name = data.topic.name;
  return [
    `¿Por qué está creciendo «${name}» y quién lo está moviendo?`,
    `¿Cómo contaría 30X «${name}» para ejecutivos?`,
    ...STARTERS.slice(0, 2),
  ];
}

/** "Pregúntale al radar": a read-only conversation about the week, with cited topics and pieces. */
export function AskPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const starters = useStarters(open);
  const setOpen = onOpenChange;

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setDraft('');
    setBusy(true);
    const history = turns
      .filter((t) => t.answer)
      .map((t) => ({ question: t.question, answer: t.answer!.answer }));
    setTurns((all) => [...all, { question: q }]);
    try {
      const answer = await post<Answer>('/api/v1/ask', { question: q, history });
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, answer } : t)));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No pude responder ahora.';
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, error: message } : t)));
    } finally {
      setBusy(false);
    }
  };

  const last = turns.at(-1)?.answer;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[3px]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
          className="fixed top-0 right-0 z-50 flex h-dvh w-full max-w-[460px] flex-col bg-paper shadow-float outline-none"
        >
          <header className="bg-noche px-6 pt-6 pb-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <DialogPrimitive.Title className="t-h2 text-white">
                Pregúntale al radar
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="mt-2 text-[0.92rem] text-white/70">
              Responde con lo que midió esta semana y te dice de qué tema o pieza sale cada dato.
            </DialogPrimitive.Description>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {turns.length === 0 && (
              <div className="grid gap-2">
                <p className="text-sm text-ink-3">Prueba con:</p>
                {starters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="rounded-[16px] bg-sheet px-4 py-3 text-left text-[0.95rem] text-ink shadow-sheet transition hover:-translate-y-0.5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-5">
              {turns.map((t, i) => (
                <div key={i} className="grid gap-2.5">
                  <p className="ml-auto max-w-[85%] rounded-[18px] rounded-br-[6px] bg-marker px-4 py-2.5 text-[0.95rem] text-on-marker">
                    {t.question}
                  </p>
                  {t.answer && (
                    <div className="pass-in max-w-[92%] rounded-[18px] rounded-bl-[6px] bg-sheet px-4 py-3 shadow-sheet">
                      <p className="text-[0.96rem] leading-relaxed whitespace-pre-line text-ink">
                        {t.answer.answer}
                      </p>
                      {t.answer.refs.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.answer.refs.map((r) =>
                            r.external ? (
                              <a
                                key={r.ref}
                                href={r.href}
                                target="_blank"
                                rel="noreferrer"
                                className="max-w-full truncate rounded-full bg-fill px-2.5 py-1 text-[0.8rem] font-[600] text-brand hover:bg-brand-tint"
                              >
                                {r.label}
                              </a>
                            ) : (
                              <Link
                                key={r.ref}
                                href={r.href}
                                onClick={() => setOpen(false)}
                                className="max-w-full truncate rounded-full bg-fill px-2.5 py-1 text-[0.8rem] font-[600] text-brand hover:bg-brand-tint"
                              >
                                {r.label}
                              </Link>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {t.error && (
                    <p className="max-w-[92%] rounded-[18px] bg-held-tint px-4 py-3 text-[0.95rem] text-ink">
                      {t.error}
                    </p>
                  )}
                </div>
              ))}
              {busy && (
                <p className="flex items-center gap-2 text-sm text-ink-3">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Revisando la semana, tarda
                  unos segundos…
                </p>
              )}
              {!busy && last && last.followUps.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {last.followUps.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => ask(q)}
                      className="rounded-full border-2 border-rule-strong px-3 py-1.5 text-left text-[0.86rem] text-ink-2 hover:border-brand hover:text-ink"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div ref={end} />
            </div>
          </div>

          <form
            className="border-t border-rule bg-sheet p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <div className="flex items-end gap-2 rounded-[22px] bg-fill p-1.5 pl-4">
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                rows={1}
                placeholder="Pregunta por un tema, una red o un formato"
                aria-label="Tu pregunta"
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.95rem] text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="submit"
                disabled={busy || draft.trim().length < 3}
                className={clsx(
                  'grid size-10 shrink-0 place-items-center rounded-full bg-marker text-on-marker transition',
                  'disabled:opacity-40',
                )}
                aria-label="Preguntar"
              >
                <ArrowUp className="size-5" strokeWidth={2.6} />
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
