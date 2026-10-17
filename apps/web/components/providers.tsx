'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SWRConfig } from 'swr';
import { LiveProvider } from '@/lib/live';
import { TooltipProvider } from './ui';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>
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
    </SWRConfig>
  );
}
