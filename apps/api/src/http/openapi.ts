import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { ServiceError } from '../services/state';

/** Responses are typed in the services; the spec documents their shape loosely. */
export const AnyJson = z.any().openapi({ type: 'object' });

const errorShape = {
  content: { 'application/json': { schema: z.object({ error: z.string() }) } },
};

export function ok(description: string) {
  return {
    200: { description, content: { 'application/json': { schema: AnyJson } } },
    400: { description: 'Solicitud inválida', ...errorShape },
    404: { description: 'No existe', ...errorShape },
    409: { description: 'Conflicto de estado', ...errorShape },
  } as const;
}

export const IdParam = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export function json<T extends z.ZodType>(schema: T) {
  return { content: { 'application/json': { schema } }, required: true } as const;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = /\.(pdf|eml|txt)$/i;

/** A file field of a multipart form: PDF, e-mail or text, at most 10 MB. */
export async function formFile(
  c: Context,
  field: string,
  required: boolean,
): Promise<{ bytes: Uint8Array; filename: string } | undefined> {
  const value = (await c.req.parseBody())[field];
  if (!(value instanceof File)) {
    if (required) throw new ServiceError(400, `Adjunta un archivo en el campo «${field}».`);
    return undefined;
  }
  if (!ACCEPTED.test(value.name))
    throw new ServiceError(400, 'Formato no soportado: usa PDF, correo (.eml) o texto (.txt).');
  if (value.size > MAX_UPLOAD_BYTES) throw new ServiceError(413, 'El archivo supera los 10 MB.');
  return { bytes: new Uint8Array(await value.arrayBuffer()), filename: value.name };
}

export async function formText(c: Context, field: string): Promise<string> {
  const value = (await c.req.parseBody())[field];
  return typeof value === 'string' ? value : '';
}

export const multipart = (fields: Record<string, z.ZodType>) => ({
  content: { 'multipart/form-data': { schema: z.object(fields) } },
  required: true,
});

export const binary = () => z.any().openapi({ type: 'string', format: 'binary' });
