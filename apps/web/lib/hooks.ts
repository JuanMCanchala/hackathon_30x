'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { api } from './api';

/** SWR keyed by the API path. */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => api<T>(p), { keepPreviousData: true, ...config });
}
