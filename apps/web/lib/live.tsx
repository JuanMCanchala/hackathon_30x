'use client';

/**
 * Real-time updates: one EventSource for the whole app. Every event revalidates the SWR cache,
 * so a pipeline run or a piece sent from the sensor shows up without reloading.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export interface LiveEvent {
  type: string;
  at: string;
  data: Record<string, unknown>;
}

type LiveListener = (event: LiveEvent) => void;

interface LiveContextValue {
  connected: boolean;
  subscribe: (listener: LiveListener) => () => void;
}

const LiveContext = createContext<LiveContextValue>({
  connected: false,
  subscribe: () => () => undefined,
});

export function LiveProvider({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const [connected, setConnected] = useState(false);
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
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      listeners.current.forEach((listener) => listener(event));
      if (event.type === 'sensor.received' && typeof event.data.title === 'string') {
        toast('Llegó una pieza del sensor', { description: event.data.title });
      }
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => void mutate(() => true), 400);
    };
    return () => source.close();
  }, [mutate]);

  return <LiveContext.Provider value={{ connected, subscribe }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
