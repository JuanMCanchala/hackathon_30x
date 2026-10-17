import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Time source. Guided demo months pass explicit instants instead of reading the clock. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function iso(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  return (typeof date === 'string' ? new Date(date) : date).toISOString();
}

export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} no existe.`);
export const forbidden = (message: string) => new AppError(403, 'forbidden', message);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const badRequest = (message: string) => new AppError(400, 'bad_request', message);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Escapes a value for CSV (RFC 4180). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
