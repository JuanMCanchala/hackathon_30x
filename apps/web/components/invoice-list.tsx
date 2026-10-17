'use client';

import clsx from 'clsx';
import { FileImage, FileText, Mail, MessageCircle, Bot } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@mandato/domain';
import { useLive } from '@/lib/live';
import { SOURCE_COPY } from '@/lib/outcomes';
import type { InvoiceListItem } from '@/lib/types';
import { fmtDateTime, Money, StatusTag } from './ui';

// Settings-style glyphs: each way a bill arrives has its own tile color.
const KIND_ICON: Record<string, { icon: typeof FileText; tile: string }> = {
  pdf: { icon: FileText, tile: 'bg-[#ff6b5e]' },
  image: { icon: FileImage, tile: 'bg-[#bf5af2]' },
  email: { icon: Mail, tile: 'bg-[#0a84ff]' },
  text: { icon: MessageCircle, tile: 'bg-[#30b94d]' },
  agent: { icon: Bot, tile: 'bg-[#5e5ce6]' },
};

export function KindIcon({ kind, className }: { kind: string | null; className?: string }) {
  const { icon: Icon, tile } = (kind && KIND_ICON[kind]) || KIND_ICON.pdf!;
  return (
    <span
      className={clsx('grid size-8 place-items-center rounded-[8px] text-white', tile, className)}
      aria-hidden
    >
      <Icon className="size-[1.05rem]" strokeWidth={2.1} />
    </span>
  );
}

/** When the money leaves, for bills whose transfer has not arrived yet. */
function PaymentHint({ payment }: { payment: InvoiceListItem['payment'] }) {
  if (!payment || payment.status === 'settled') return null;
  const day = formatDate(payment.scheduledFor).replace(/ \d{4}$/, '');
  return (
    <span className="block text-xs text-ink-3">
      {payment.status === 'scheduled' ? `Sale el ${day}` : 'Transferencia en camino'}
    </span>
  );
}

function Approvals({ item }: { item: InvoiceListItem }) {
  if (item.status !== 'PENDING_APPROVAL' || item.approvalsRequired < 2) return null;
  return (
    <span className="block text-xs text-ink-3">
      {item.approvalsCount} de {item.approvalsRequired} firmas
    </span>
  );
}

/** A dense, scannable list of decisions. Each row opens the receipt. */
export function InvoiceRows({ items, compact }: { items: InvoiceListItem[]; compact?: boolean }) {
  const { fresh } = useLive();
  return (
    <ul>
      {items.map((item, index) => (
        <li key={item.id} className={clsx('relative', fresh.has(item.id) && 'row-in')}>
          {index > 0 && (
            <span className="absolute top-0 right-0 left-[3.9rem] h-px bg-rule" aria-hidden />
          )}
          <Link
            href={`/facturas/${item.id}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 px-4 py-3 transition-colors hover:bg-sheet-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
          >
            <KindIcon kind={item.documentKind} className="mt-0.5 sm:mt-0" />
            <span className="min-w-0">
              <span className="line-clamp-2 font-[600] text-ink sm:block sm:truncate">
                {item.title ?? item.issuerName ?? item.ref}
              </span>
              {!compact && item.summary && (
                <span className="mt-0.5 line-clamp-2 text-sm text-ink-2 sm:block sm:truncate">
                  {item.summary}
                </span>
              )}
              <span className="mt-0.5 block text-xs text-ink-3">
                {item.ref}, {SOURCE_COPY[item.source] ?? item.source},{' '}
                {fmtDateTime(item.receivedAt)}
              </span>
              {/* On a phone the amount and the decision go under the title, at full width. */}
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
                <Money
                  minor={item.amountMinor}
                  currency={item.currency}
                  usdCents={item.usdCents}
                  showUsd={false}
                  className="text-sm font-[600] text-ink"
                />
                <StatusTag status={item.status} />
                <PaymentHint payment={item.payment} />
                <Approvals item={item} />
              </span>
            </span>
            <span className="hidden text-right text-sm sm:block">
              <Money
                minor={item.amountMinor}
                currency={item.currency}
                usdCents={item.usdCents}
                showUsd={false}
                className="font-[600] text-ink"
              />
            </span>
            <span className="hidden text-right sm:block">
              <StatusTag status={item.status} />
              <span className="mt-1 block empty:hidden">
                <PaymentHint payment={item.payment} />
                <Approvals item={item} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
