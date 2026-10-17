'use client';

import { Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import { OutcomeStamp } from '@/components/outcome';
import { Button, buttonClass, FileField } from '@/components/ui';
import { api, UPLOAD_MB } from '@/lib/api';
import type { Outcome } from '@/lib/types';

interface Uploaded {
  billId: string;
  duplicateDocument: boolean;
  outcome: Outcome | null;
  summary: string | null;
}

/** Upload a bill (PDF, .eml or .txt) and see the decision; a native <dialog> holds the focus. */
export function UploadDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uploaded | null>(null);
  const { mutate } = useSWRConfig();

  function open() {
    setFile(null);
    setError(null);
    setResult(null);
    dialog.current?.showModal();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Elige un archivo.');
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      setResult(await api.post<Uploaded>('/bills', body));
      void mutate('/bills');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={open}>
        <Upload className="size-4" aria-hidden />
        Subir una cuenta
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="subir-titulo"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[10px] border border-rule bg-sheet p-0 text-ink shadow-sheet backdrop:bg-ink/40"
      >
        <div className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="subir-titulo" className="t-h3">
                Subir una cuenta
              </h2>
              <p className="mt-1 text-[0.9375rem] text-ink-2">
                PDF, correo (.eml) o texto, hasta {UPLOAD_MB} MB. Recibido la lee y la decide al
                momento.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="grid size-9 shrink-0 place-items-center rounded-[6px] text-ink-2 hover:bg-fill hover:text-ink"
            >
              <X className="size-5" aria-hidden />
              <span className="sr-only">Cerrar</span>
            </button>
          </div>

          {result ? (
            <div className="grid gap-4" aria-live="polite">
              {result.outcome && <OutcomeStamp outcome={result.outcome} land />}
              <p className="text-ink">
                {result.duplicateDocument
                  ? 'Este mismo archivo ya había llegado; no se registró de nuevo.'
                  : (result.summary ?? 'La cuenta quedó registrada.')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/cuentas/${result.billId}`}
                  className={buttonClass()}
                  onClick={() => dialog.current?.close()}
                >
                  Ver el recibo
                </Link>
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Subir otra
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="grid gap-4">
              <FileField label="Archivo de la cuenta" file={file} onChange={setFile} />
              {error && (
                <p role="alert" className="text-[0.875rem] font-[650] text-escalate">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || !file}>
                  {busy ? 'Leyendo la cuenta…' : 'Subir y decidir'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
