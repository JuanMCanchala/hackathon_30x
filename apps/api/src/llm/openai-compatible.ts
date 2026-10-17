/**
 * Minimal client for OpenAI-compatible chat completions whose answer must follow a JSON schema
 * (Fireworks by default, ADR-0017). Plain fetch: one request, no SDK, no hidden retries.
 */
import { z } from 'zod';

export type ChatPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatJsonRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  content: ChatPart[];
  /** JSON schema the answer is constrained to (see jsonSchemaOf). */
  schema: Record<string, unknown>;
  schemaName: string;
  /** Reasoning models spend part of this budget thinking before they answer. */
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatJsonResult {
  json: unknown;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ChatCompletion {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string } | string;
}

/** The JSON schema of a Zod schema, as chat APIs expect it (no $schema key). */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: 'draft-7' });
  return rest;
}

/** A connection that failed before any answer (DNS, connect timeout, reset): worth retrying. */
const isNetworkError = (error: unknown) =>
  error instanceof TypeError && error.message === 'fetch failed';

/** fetch with two more tries on network failures; any HTTP answer, even an error, is final. */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= attempts || !isNetworkError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

export async function chatJson(request: ChatJsonRequest): Promise<ChatJsonResult> {
  const started = Date.now();
  const response = await fetchWithRetry(`${request.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${request.apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(request.timeoutMs ?? 300_000),
    body: JSON.stringify({
      model: request.model,
      temperature: 0,
      max_tokens: request.maxTokens ?? 16_000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: request.schemaName, schema: request.schema, strict: true },
      },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.content },
      ],
    }),
  });
  const body = (await response.json().catch(() => null)) as ChatCompletion | null;
  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? body.error : body?.error?.message;
    throw new ChatApiError(response.status, detail ?? `HTTP ${response.status}`);
  }
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('La lectura quedó incompleta (límite de tokens).');
  }
  const text = choice?.message?.content;
  if (!text) throw new Error('El modelo no devolvió contenido.');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('El modelo no devolvió JSON válido.');
  }
  return {
    json,
    model: body?.model ?? request.model,
    latencyMs: Date.now() - started,
    usage: {
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
      cacheReadTokens: body?.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}

/** Spanish description of a chat API failure, for receipts and logs. */
export function describeChatError(error: unknown, label: string): string {
  if (error instanceof ChatApiError) {
    if (error.status === 401 || error.status === 403) return `${label} rechazó la credencial`;
    if (error.status === 429) return `${label} está saturada; intenta de nuevo`;
    if (error.status >= 400 && error.status < 500)
      return `${label} rechazó el documento (${error.message})`;
    return `error de ${label} (${error.status})`;
  }
  if (error instanceof Error && error.name === 'TimeoutError')
    return `${label} no respondió a tiempo`;
  if (isNetworkError(error)) return `no hubo conexión con ${label}`;
  if (error instanceof Error) return error.message;
  return 'error desconocido al leer el documento';
}
