'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { api } from './api';
import { useSession } from './session';

/** SWR keyed by path and acting user, so switching users refetches with the right identity. */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  const { userId } = useSession();
  return useSWR<T>(path ? [path, userId] : null, ([p]: [string]) => api<T>(p), {
    keepPreviousData: true,
    ...config,
  });
}
