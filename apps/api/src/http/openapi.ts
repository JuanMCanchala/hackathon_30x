import { z } from '@hono/zod-openapi';

/** Responses are typed in packages/domain and the services; the spec documents their shape loosely. */
export const AnyJson = z.any().openapi({ type: 'object' });

export function ok(description: string) {
  return {
    200: { description, content: { 'application/json': { schema: AnyJson } } },
    400: { description: 'Solicitud inválida' },
    403: { description: 'Sin permiso' },
    404: { description: 'No existe' },
    409: { description: 'Conflicto de estado' },
  } as const;
}

export const IdParam = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' } }),
});
export const NoteBody = z.object({ note: z.string().max(2000).nullable().optional() });

export function json<T extends z.ZodType>(schema: T) {
  return { content: { 'application/json': { schema } }, required: true } as const;
}
