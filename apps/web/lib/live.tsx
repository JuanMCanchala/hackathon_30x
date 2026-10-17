'use client';

/**
 * Real-time updates (ADR-0014): one EventSource for the whole app. Every domain event
 * revalidates the SWR cache; new decisions also raise a toast.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { OUTCOME_COPY } from './outcomes';
import type { Outcome } from './types';

export interface LiveEvent {
  type: string;
  at: string;
  data: Record<string, unknown>;
}

type LiveListener = (event: LiveEvent) => void;

interface LiveContextValue {
  connected: boolean;
  /** Ids of bills decided while this tab was open, to highlight them once. */
  fresh: ReadonlySet<string>;
  /** Calls the listener with every event; returns the unsubscribe function. */
  subscribe: (listener: LiveListener) => () => void;
}

const LiveContext = createContext<LiveContextValue>({
  connected: false,
  fresh: new Set(),
  subscribe: () => () => undefined,
});

export function LiveProvider({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const [connected, setConnected] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const listeners = useRef(new Set<LiveListener>());
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribe = useCallback((listener: LiveListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/v1/events');
    const revalidate = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        void mutate(() => true);
      }, 120);
    };
    const handle = (raw: MessageEvent<string>) => {
      try {
        const event = JSON.parse(raw.data) as LiveEvent;
        listeners.current.forEach((listener) => listener(event));
        revalidate();
        if (event.type === 'invoice.decided') {
          const id = String(event.data.invoiceId ?? '');
          setFresh((previous) => new Set(previous).add(id));
          const outcome = event.data.outcome as Outcome;
          if (
            !event.data.datasetId ||
            String(event.data.datasetId).startsWith('atk') ||
            String(event.data.datasetId).startsWith('vivo')
          ) {
            toast(`${String(event.data.ref)} · ${OUTCOME_COPY[outcome].short}`, {
              description: String(event.data.title ?? ''),
            });
          }
        }
        if (event.type === 'invoice.approved')
          toast('Pago aprobado', { description: 'La factura quedó autorizada.' });
      } catch {
        // ignore malformed events
      }
    };
    const types = [
      'invoice.decided',
      'invoice.approved',
      'invoice.rejected',
      'approval.recorded',
      'proposal.created',
      'proposal.resolved',
      'policy.changed',
      'registry.changed',
      'audit.completed',
      'demo.reset',
      'demo.progress',
      'payment.updated',
    ];
    types.forEach((t) => source.addEventListener(t, handle as EventListener));
    source.addEventListener('ready', () => setConnected(true));
    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);
    return () => {
      source.close();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [mutate]);

  const value = useMemo(() => ({ connected, fresh, subscribe }), [connected, fresh, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
