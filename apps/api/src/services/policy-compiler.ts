/**
 * "Escríbelo en español": a policy change written in natural language is compiled by the language
 * model (Claude or an OpenAI-compatible one, ADR-0017) into a patch of known fields, validated
 * with Zod and shown as a diff with its replayed impact. The person saves it; nothing changes
 * until then (pattern of allowance.eth, docs/product/05).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PolicyTermsSchema, type PolicyTerms } from '@mandato/domain';
import { AppError } from '../lib/common';
import { chatJson, jsonSchemaOf } from '../llm/openai-compatible';

const PolicyPatchSchema = z.object({
  autonomousLimitUsd: z.number().nullable(),
  dualApprovalAboveUsd: z.number().nullable(),
  monthlyBudgetUsd: z.number().nullable(),
  allowedCurrencies: z.array(z.string()).nullable(),
  minExtractionConfidencePercent: z.number().nullable(),
  duplicateWindowDays: z.number().nullable(),
  maxInvoiceAgeDays: z.number().nullable(),
  defaultPaymentTermsDays: z.number().nullable(),
  /** One or two sentences in Spanish explaining the change. */
  explanation: z.string(),
  /** Parts of the request that cannot be expressed with these fields, in Spanish. */
  unsupported: z.array(z.string()),
});
export type PolicyPatch = z.infer<typeof PolicyPatchSchema>;

const SYSTEM = `You translate a finance manager's request, written in Spanish, into changes to a payment policy. The policy has exactly these fields:
- autonomousLimitUsd: maximum USD amount of a single payment the agent may make without a person's approval.
- dualApprovalAboveUsd: payments above this USD amount need two different approvers.
- monthlyBudgetUsd: total USD the company commits to payments per calendar month.
- allowedCurrencies: ISO 4217 codes the company pays in.
- minExtractionConfidencePercent: minimum reading confidence (0-100) to pay without a person.
- duplicateWindowDays: days within which two bills of the same amount from the same payee are treated as a possible duplicate.
- maxInvoiceAgeDays: maximum age of a bill that can be paid without a person.
- defaultPaymentTermsDays: payment term assumed when a bill has no due date.

Return only the fields the request changes; every other field must be null. Interpret amounts written as "5 mil", "5k", "cinco mil dólares" as numbers in USD. If the request mentions something these fields cannot express (specific payees, weekdays, categories, approvals by a named person…), do not approximate it: list it in "unsupported". Write "explanation" in Spanish, one or two sentences, describing exactly what would change. Never loosen a rule the request did not ask to loosen.`;

export type PolicyCompilerOptions =
  | { provider: 'anthropic'; apiKey: string; model: string }
  | { provider: 'fireworks'; apiKey: string; model: string; baseUrl: string };

const PATCH_SCHEMA = jsonSchemaOf(PolicyPatchSchema);

export class PolicyCompiler {
  private readonly anthropic: Anthropic | null;

  constructor(private readonly options: PolicyCompilerOptions) {
    this.anthropic =
      options.provider === 'anthropic' ? new Anthropic({ apiKey: options.apiKey }) : null;
  }

  /** The model's patch, or null when it declines. */
  private async requestPatch(prompt: string): Promise<unknown> {
    if (this.options.provider === 'fireworks') {
      const result = await chatJson({
        baseUrl: this.options.baseUrl,
        apiKey: this.options.apiKey,
        model: this.options.model,
        system: SYSTEM,
        content: [{ type: 'text', text: prompt }],
        schema: PATCH_SCHEMA,
        schemaName: 'policy_patch',
        maxTokens: 8000,
      });
      return result.json;
    }
    const response = await this.anthropic!.beta.messages.parse({
      model: this.options.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'low', format: betaZodOutputFormat(PolicyPatchSchema) },
    });
    return response.stop_reason === 'refusal' ? null : response.parsed_output;
  }

  async compile(
    request: string,
    current: PolicyTerms,
  ): Promise<{ patch: PolicyPatch; terms: PolicyTerms }> {
    const raw = await this.requestPatch(
      `Current policy (for reference): ${JSON.stringify({
        autonomousLimitUsd: current.autonomousLimitUsdCents / 100,
        dualApprovalAboveUsd: current.dualApprovalAboveUsdCents / 100,
        monthlyBudgetUsd: current.monthlyBudgetUsdCents / 100,
        allowedCurrencies: current.allowedCurrencies,
        minExtractionConfidencePercent: current.minExtractionConfidence * 100,
        duplicateWindowDays: current.duplicateWindowDays,
        maxInvoiceAgeDays: current.maxInvoiceAgeDays,
        defaultPaymentTermsDays: current.defaultPaymentTermsDays,
      })}\n\nRequest: ${request}`,
    );
    const parsedPatch = PolicyPatchSchema.safeParse(raw);
    if (!raw || !parsedPatch.success) {
      throw new AppError(422, 'not_compilable', 'No pude convertir ese texto en una regla.');
    }
    const patch = parsedPatch.data;
    const cents = (usd: number | null, fallback: number) =>
      usd === null ? fallback : Math.round(usd * 100);
    const candidate: PolicyTerms = {
      ...current,
      autonomousLimitUsdCents: cents(patch.autonomousLimitUsd, current.autonomousLimitUsdCents),
      dualApprovalAboveUsdCents: cents(
        patch.dualApprovalAboveUsd,
        current.dualApprovalAboveUsdCents,
      ),
      monthlyBudgetUsdCents: cents(patch.monthlyBudgetUsd, current.monthlyBudgetUsdCents),
      allowedCurrencies:
        patch.allowedCurrencies?.map((c) => c.toUpperCase()) ?? current.allowedCurrencies,
      minExtractionConfidence:
        patch.minExtractionConfidencePercent === null
          ? current.minExtractionConfidence
          : patch.minExtractionConfidencePercent / 100,
      duplicateWindowDays: patch.duplicateWindowDays ?? current.duplicateWindowDays,
      maxInvoiceAgeDays: patch.maxInvoiceAgeDays ?? current.maxInvoiceAgeDays,
      defaultPaymentTermsDays: patch.defaultPaymentTermsDays ?? current.defaultPaymentTermsDays,
    };
    const parsed = PolicyTermsSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AppError(
        422,
        'invalid_policy',
        `La regla resultante no es válida: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return { patch, terms: parsed.data };
  }
}
