/**
 * One call shape for every feature that needs the language model to write (answers, drafts):
 * a system prompt, a user message and a Zod schema the answer must satisfy. Claude uses
 * structured outputs; OpenAI-compatible providers use JSON-schema outputs (ADR-0017). The model
 * never decides anything here either: it reads data we hand it and writes text for a person.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { Config } from '../config';
import { llmSettings } from '../config';
import { chatJson, jsonSchemaOf } from './openai-compatible';

export interface StructuredLlm {
  complete<T extends z.ZodType>(request: {
    system: string;
    user: string;
    schema: T;
    name: string;
    maxTokens?: number;
  }): Promise<z.infer<T>>;
}

export function structuredLlm(config: Config): StructuredLlm | null {
  const llm = llmSettings(config);
  if (!llm) return null;
  if (llm.provider === 'fireworks') {
    return {
      async complete({ system, user, schema, name, maxTokens }) {
        const result = await chatJson({
          baseUrl: config.FIREWORKS_BASE_URL,
          apiKey: llm.apiKey,
          model: llm.model,
          system,
          content: [{ type: 'text', text: user }],
          schema: jsonSchemaOf(schema),
          schemaName: name,
          maxTokens: maxTokens ?? 8000,
        });
        return schema.parse(result.json);
      },
    };
  }
  const client = new Anthropic({ apiKey: llm.apiKey });
  return {
    async complete({ system, user, schema, maxTokens }) {
      const response = await client.beta.messages.parse({
        model: llm.model,
        max_tokens: maxTokens ?? 4000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
      });
      if (response.stop_reason === 'refusal') throw new Error('El modelo no quiso responder.');
      return schema.parse(response.parsed_output);
    },
  };
}
