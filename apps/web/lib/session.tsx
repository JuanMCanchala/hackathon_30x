'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, apiUser, DEFAULT_USER, setApiUser, subscribeApiUser } from './api';
import type { Session } from './types';

interface SessionContextValue {
  session: Session | null;
  userId: string;
  switchUser: (id: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const userId = useSyncExternalStore(subscribeApiUser, apiUser, () => DEFAULT_USER);
  const { mutate } = useSWRConfig();

  // The user travels in the key and in the request, so a cached session never crosses users.
  const { data } = useSWR<Session>(['/api/v1/session', userId], ([path, user]: [string, string]) =>
    api<Session>(path, { headers: { 'x-mandato-user': user } }),
  );

  const switchUser = useCallback(
    (id: string) => {
      setApiUser(id);
      void mutate(() => true);
    },
    [mutate],
  );

  const value = useMemo(
    () => ({ session: data ?? null, userId, switchUser }),
    [data, userId, switchUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}
