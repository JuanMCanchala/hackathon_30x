/** Browser client for the Mandato API. Same origin: Next proxies /api/* (ADR-0016). */

const USER_KEY = 'mandato:user';
export const DEFAULT_USER = 'usr_laura';

/*
 * The demo user this browser acts as, sent as x-mandato-user. A tiny external store
 * (remembered in localStorage) so React reads it with useSyncExternalStore.
 */
let chosenUser: string | null = null;
const userListeners = new Set<() => void>();

export function apiUser(): string {
  if (chosenUser) return chosenUser;
  try {
    return localStorage.getItem(USER_KEY) ?? DEFAULT_USER;
  } catch {
    return DEFAULT_USER;
  }
}

export function setApiUser(userId: string) {
  chosenUser = userId;
  try {
    localStorage.setItem(USER_KEY, userId);
  } catch {
    // private mode: the choice lasts for this tab only
  }
  userListeners.forEach((listener) => listener());
}

export function subscribeApiUser(listener: () => void) {
  userListeners.add(listener);
  return () => {
    userListeners.delete(listener);
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('x-mandato-user')) headers.set('x-mandato-user', apiUser());
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'error',
      body?.error?.message ?? `La API respondió ${response.status}.`,
    );
  }
  return (await response.json()) as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
