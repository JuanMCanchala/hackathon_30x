'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SWRConfig } from 'swr';
import { LiveProvider } from '@/lib/live';
import { SessionProvider } from '@/lib/session';
import { TooltipProvider } from './ui';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>
      <SessionProvider>
        <LiveProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: '!bg-sheet !text-ink !border-rule !shadow-sheet !font-sans',
                description: '!text-ink-2',
              },
            }}
          />
        </LiveProvider>
      </SessionProvider>
    </SWRConfig>
  );
}
