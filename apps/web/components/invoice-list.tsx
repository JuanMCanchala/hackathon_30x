'use client';

import clsx from 'clsx';
import { FileImage, FileText, Mail, MessageCircle, Bot } from 'lucide-react';
import Link from 'next/link';
import { useLive } from '@/lib/live';
import { SOURCE_COPY } from '@/lib/outcomes';
import type { InvoiceListItem } from '@/lib/types';
import { fmtDateTime, Money, StatusTag } from './ui';

const KIND_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  image: FileImage,
  email: Mail,
  text: MessageCircle,
  agent: Bot,
};

export function KindIcon({ kind, className }: { kind: string | null; className?: string }) {
  const Icon = (kind && KIND_ICON[kind]) || FileText;
  return <Icon className={clsx('size-4 text-ink-3', className)} aria-hidden />;
}

/** A dense, scannable list of decisions. Each row opens the receipt. */
export function InvoiceRows({ items, compact }: { items: InvoiceListItem[]; compact?: boolean }) {
  const { fresh } = useLive();
  return (
    <ul className="divide-y divide-rule">
      {items.map((item) => (
        <li key={item.id} className={clsx(fresh.has(item.id) && 'row-in')}>
          <Link
            href={`/facturas/${item.id}`}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-sheet-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
          >
            <KindIcon kind={item.documentKind} />
            <span className="min-w-0">
              <span className="block truncate font-[600] text-ink">
                {item.title ?? item.issuerName ?? item.ref}
              </span>
              {!compact && item.summary && (
                <span className="mt-0.5 block truncate text-sm text-ink-2">{item.summary}</span>
              )}
              <span className="mt-0.5 block text-xs text-ink-3">
                {item.ref}, {SOURCE_COPY[item.source] ?? item.source},{' '}
                {fmtDateTime(item.receivedAt)}
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
            <span className="text-right">
              <StatusTag status={item.status} />
              {item.status === 'PENDING_APPROVAL' && item.approvalsRequired > 1 && (
                <span className="mt-1 block text-xs text-ink-3">
                  {item.approvalsCount} de {item.approvalsRequired} firmas
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
