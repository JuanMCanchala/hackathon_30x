'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { ArrowUp, Loader2, MessageCircleQuestion, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { InvoiceDetail } from '@/lib/types';

interface Answer {
  answer: string;
  refs: { ref: string; invoiceId: string }[];
  followUps: string[];
}

interface Turn {
  question: string;
  answer?: Answer;
  error?: string;
}

const STARTERS = [
  '¿Qué cobros esperan aprobación y por qué?',
  '¿Cuánto le pagamos a Valentina este año?',
  '¿Qué ataques intentaron sacarle un pago al agente?',
  '¿Qué pagos salen la próxima semana?',
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
        className="hidden h-10 w-full max-w-[440px] items-center gap-2.5 rounded-full bg-fill pr-2 pl-3.5 text-left text-[0.92rem] text-ink-3 transition hover:bg-sheet-2 hover:text-ink-2 md:flex"
      >
        <MessageCircleQuestion className="size-[1.1rem] shrink-0 text-brand" aria-hidden />
        <span className="flex-1 truncate">Pregúntale a Mandato sobre cobros y pagos</span>
        <kbd className="rounded-md bg-sheet px-1.5 py-0.5 font-sans text-[0.75rem] font-[600] text-ink-3 shadow-sheet">
          {shortcut}
        </kbd>
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Pregúntale a Mandato"
        className="grid size-10 place-items-center rounded-full text-brand hover:bg-fill md:hidden"
      >
        <MessageCircleQuestion className="size-5" aria-hidden />
      </button>
    </>
  );
}

/** Questions about the receipt on screen come first when the conversation opens from one. */
function useStarters(open: boolean): string[] {
  const pathname = usePathname();
  const id = pathname.match(/^\/facturas\/(inv_[\w]+)/)?.[1];
  const { data } = useApi<InvoiceDetail>(open && id ? `/api/v1/invoices/${id}` : null);
  if (!data) return STARTERS;
  const who = data.payee?.name ?? data.issuerName;
  return [
    `¿Por qué ${data.ref} quedó así y qué falta para pagarlo?`,
    ...(who ? [`¿Qué historial tiene ${who} con nosotros?`] : []),
    ...STARTERS.slice(0, 2),
  ];
}

/** "Pregúntale a Mandato": a read-only conversation about the payables, with cited receipts. */
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
              <div>
                <p className="font-hand -rotate-1 text-[1.4rem] leading-none text-marker">
                  solo lee, nunca paga
                </p>
                <DialogPrimitive.Title className="font-display mt-1 text-[1.6rem] font-[780] tracking-[-0.03em]">
                  Pregúntale a Mandato
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close
                className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="mt-2 text-[0.92rem] text-white/70">
              Responde con lo que hay en el registro y te dice de qué comprobante salió cada dato.
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
                          {t.answer.refs.map((r) => (
                            <Link
                              key={r.ref}
                              href={`/facturas/${r.invoiceId}`}
                              onClick={() => setOpen(false)}
                              className="rounded-full bg-fill px-2.5 py-1 text-[0.8rem] font-[600] text-brand hover:bg-brand-tint"
                            >
                              {r.ref}
                            </Link>
                          ))}
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
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Revisando el registro,
                  tarda unos segundos…
                </p>
              )}
              {!busy && last && last.followUps.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {last.followUps.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => ask(q)}
                      className="rounded-full border-2 border-rule-strong px-3 py-1.5 text-left text-[0.86rem] text-ink-2 hover:border-noche hover:text-ink"
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
                placeholder="Pregunta por un cobro, un pago o un proveedor"
                aria-label="Tu pregunta"
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.95rem] text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="submit"
                disabled={busy || draft.trim().length < 3}
                className={clsx(
                  'grid size-10 shrink-0 place-items-center rounded-full bg-noche text-marker transition',
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
