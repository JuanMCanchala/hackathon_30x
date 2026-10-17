/**
 * Minimal client for OpenAI-compatible chat completions that must answer one JSON object
 * (DeepSeek, OpenRouter). DeepSeek supports `response_format: json_object` but not json_schema,
 * so the shape travels in the prompt (`schemaHint`) and the answer is validated with zod.
 * Plain fetch, injectable for tests. One retry, only for an invalid or empty answer.
 */
import type { z } from 'zod';

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ChatJsonRequest<T> {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** An example object of the expected answer; DeepSeek needs the word "json" and an example. */
  schemaHint: string;
  maxTokens?: number;
  timeoutMs?: number;
  fetch?: Fetch;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface ChatJsonResult<T> {
  json: T;
  model: string;
  latencyMs: number;
  usage: Usage;
}

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The model answered, but not with a valid JSON object of the expected shape. */
export class InvalidAnswerError extends Error {}

interface ChatCompletion {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string } | string;
}

async function callOnce<T>(request: ChatJsonRequest<T>): Promise<ChatJsonResult<T>> {
  const started = Date.now();
  const doFetch = request.fetch ?? fetch;
  const response = await doFetch(`${request.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${request.apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(request.timeoutMs ?? 120_000),
    body: JSON.stringify({
      model: request.model,
      temperature: 0,
      max_tokens: request.maxTokens ?? 8_000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${request.system}\n\nAnswer with one json object only, shaped like this example:\n${request.schemaHint}`,
        },
        { role: 'user', content: request.user },
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
    throw new InvalidAnswerError('La respuesta quedó incompleta (límite de tokens).');
  }
  const text = choice?.message?.content?.trim();
  if (!text) throw new InvalidAnswerError('El modelo no devolvió contenido JSON.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidAnswerError('El modelo no devolvió JSON válido.');
  }
  const parsed = request.schema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidAnswerError('El JSON del modelo no tiene la forma esperada.');
  }
  return {
    json: parsed.data,
    model: body?.model ?? request.model,
    latencyMs: Date.now() - started,
    usage: {
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
      cacheReadTokens:
        body?.usage?.prompt_cache_hit_tokens ??
        body?.usage?.prompt_tokens_details?.cached_tokens ??
        0,
    },
  };
}

export async function chatJson<T>(request: ChatJsonRequest<T>): Promise<ChatJsonResult<T>> {
  try {
    return await callOnce(request);
  } catch (error) {
    if (!(error instanceof InvalidAnswerError)) throw error;
    return callOnce(request);
  }
}

/** Spanish description of a chat API failure, for receipts and logs (never includes the key). */
export function describeChatError(error: unknown, label: string): string {
  if (error instanceof ChatApiError) {
    if (error.status === 401 || error.status === 403) return `${label} rechazó la credencial`;
    if (error.status === 402) return `${label} no tiene saldo`;
    if (error.status === 429) return `${label} está saturado; intenta de nuevo`;
    if (error.status >= 400 && error.status < 500)
      return `${label} rechazó la solicitud (${error.message})`;
    return `error de ${label} (${error.status})`;
  }
  if (error instanceof Error && error.name === 'TimeoutError')
    return `${label} no respondió a tiempo`;
  if (error instanceof Error) return error.message;
  return `error desconocido de ${label}`;
}
