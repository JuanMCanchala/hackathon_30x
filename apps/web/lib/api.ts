'use client';

/** Browser client for the Recibido API. Same origin: Next proxies /api/* to API_URL, or serves it in-process. */
import useSWR, { type SWRConfiguration } from 'swr';
import type {
  BillListItem,
  BillReceipt,
  Conversation,
  Overview,
  PublicPayment,
  Reconciliation,
  TourState,
  VendorView,
} from './types';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The largest file this deployment takes, in MB (10; 4 on the hosted demo). */
export const UPLOAD_MB = Number(process.env.NEXT_PUBLIC_UPLOAD_MB ?? 10);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (init.body instanceof FormData)
    for (const value of init.body.values())
      if (value instanceof File && value.size > UPLOAD_MB * 1024 * 1024)
        throw new ApiError(413, `El archivo supera los ${UPLOAD_MB} MB.`);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, cache: 'no-store' });
  } catch {
    throw new ApiError(
      0,
      'No hay conexión con el servidor de Recibido. Intenta de nuevo en unos segundos.',
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message =
      typeof body?.error === 'string'
        ? body.error
        : ((body?.error as { message?: string } | undefined)?.message ??
          `La API respondió ${response.status}.`);
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(body instanceof FormData
        ? { body }
        : body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    }),
};

const LIVE: SWRConfiguration = { refreshInterval: 1500, keepPreviousData: true };

function useLive<T>(path: string | null) {
  return useSWR<T, ApiError>(path, (p: string) => api.get<T>(p), LIVE);
}

export const useOverview = () => useLive<Overview>('/overview');
export const useBills = () => useLive<BillListItem[]>('/bills');
export const useBill = (id: string | null) =>
  useLive<BillReceipt>(id ? `/bills/${encodeURIComponent(id)}` : null);
export const useTour = () => useLive<TourState>('/demo/tour');
export const useReconciliation = () => useLive<Reconciliation>('/reconciliation');
export const useConversations = () => useLive<Conversation[]>('/conversations');
export const useVendors = () => useLive<VendorView[]>('/vendors');
export const usePayments = () => useLive<PublicPayment[]>('/payments');
