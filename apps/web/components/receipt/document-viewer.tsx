'use client';

import { Download, Paperclip } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import type { ChatView, EmailView, InvoiceDetail, PdfView } from '@/lib/types';
import { fmtDateTime } from '../ui';

/**
 * PDF pages as images: they look the same on a phone, in any browser, and load fast. A page
 * opens the original PDF. Without rendered pages (no poppler on the server) the browser's own
 * PDF viewer is the fallback.
 */
function PdfPages({
  base,
  pages,
  href,
  title,
}: {
  base: string;
  pages: number;
  href: string;
  title: string;
}) {
  const shown = Math.min(pages, 4);
  return (
    <div className="grid gap-3 rounded-[14px] bg-fill p-3 sm:p-4">
      {Array.from({ length: shown }, (_, i) => (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noreferrer"
          title="Abrir el PDF original"
          className="block min-h-[240px] overflow-hidden rounded-[6px] bg-white shadow-sheet ring-1 ring-black/5 transition hover:-translate-y-0.5"
        >
          <img
            src={`${base}/${i + 1}`}
            alt={`${title}, página ${i + 1} de ${pages}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="block h-auto w-full"
          />
        </a>
      ))}
      {pages > shown && (
        <p className="text-center text-sm text-ink-3">
          {pages - shown === 1 ? 'Una página más' : `${pages - shown} páginas más`} en el PDF.
        </p>
      )}
    </div>
  );
}

export function DocumentViewer({ invoice }: { invoice: InvoiceDetail }) {
  const doc = invoice.document;
  const { data } = useApi<EmailView | ChatView | PdfView>(
    doc && doc.kind !== 'image' ? `/api/v1/invoices/${invoice.id}/document/view` : null,
  );
  const src = `/api/v1/invoices/${invoice.id}/document`;

  if (!doc) {
    return (
      <div className="rounded-[14px] bg-sheet-2 p-4 text-sm text-ink-2">
        Solicitud estructurada de un agente externo: no hay documento, solo los datos que envió.
        <pre className="mt-3 overflow-x-auto rounded-md bg-sheet p-3 text-xs text-ink">
          {JSON.stringify(invoice.extraction, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {data?.kind === 'pdf' &&
        (data.pages > 0 ? (
          <PdfPages base={`${src}/pages`} pages={data.pages} href={src} title={doc.filename} />
        ) : (
          <iframe
            src={`${src}#toolbar=0&navpanes=0&view=FitH`}
            title={`Documento original: ${doc.filename}`}
            className="h-[640px] w-full rounded-lg border border-rule bg-white"
          />
        ))}
      {doc.kind === 'image' && (
        <img
          src={src}
          alt={`Documento original: ${doc.filename}`}
          className="w-full rounded-lg border border-rule"
        />
      )}
      {data?.kind === 'email' && (
        <div className="overflow-hidden rounded-[14px] border border-rule bg-sheet">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-rule bg-sheet-2 px-4 py-3 text-sm">
            <dt className="text-ink-3">De</dt>
            <dd className="text-ink">{data.from}</dd>
            <dt className="text-ink-3">Para</dt>
            <dd className="text-ink">{data.to}</dd>
            <dt className="text-ink-3">Asunto</dt>
            <dd className="font-[600] text-ink">{data.subject}</dd>
            {data.date && (
              <>
                <dt className="text-ink-3">Fecha</dt>
                <dd className="text-ink">{fmtDateTime(data.date)}</dd>
              </>
            )}
          </dl>
          <pre className="px-4 py-4 font-sans text-[0.93rem] leading-relaxed whitespace-pre-wrap text-ink">
            {data.text}
          </pre>
          {data.attachments.length > 0 && (
            <ul className="border-t border-rule px-4 py-3">
              {data.attachments.map((a) => (
                <li key={a.index}>
                  <a
                    href={`${src}/attachments/${a.index}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
                  >
                    <Paperclip className="size-4" aria-hidden /> {a.filename}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {(() => {
            const pdf = data.attachments.find((a) => a.mediaType === 'application/pdf');
            if (!pdf) return null;
            const href = `${src}/attachments/${pdf.index}`;
            return pdf.pages ? (
              <div className="border-t border-rule">
                <PdfPages
                  base={`${href}/pages`}
                  pages={pdf.pages}
                  href={href}
                  title={pdf.filename}
                />
              </div>
            ) : (
              <iframe
                src={`${href}#toolbar=0&view=FitH`}
                title="Adjunto en PDF"
                className="h-[560px] w-full border-t border-rule bg-white"
              />
            );
          })()}
        </div>
      )}
      {data?.kind === 'chat' && (
        <div className="grid gap-2 rounded-[14px] bg-sheet-2 p-4">
          {data.messages.map((m, i) => (
            <div
              key={i}
              className="max-w-[90%] rounded-2xl rounded-tl-md bg-sheet px-3.5 py-2.5 shadow-sm"
            >
              {m.sender && <p className="text-xs font-[650] text-brand">{m.sender}</p>}
              <p className="text-[0.93rem] leading-relaxed whitespace-pre-wrap text-ink">
                {m.text}
              </p>
              {m.at && (
                <p className="mt-1 text-right text-[0.7rem] text-ink-3">
                  {m.at.replace('T', ' ').slice(0, 16)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <a
        href={src}
        className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
        download={doc.filename}
      >
        <Download className="size-4" aria-hidden /> Descargar {doc.filename}
      </a>
    </div>
  );
}
