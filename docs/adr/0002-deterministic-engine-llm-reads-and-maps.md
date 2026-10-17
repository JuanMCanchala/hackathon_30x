# ADR-0002: A deterministic engine decides; the language model only reads and maps lines

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

One improper payment disqualifies. Language models read messy bills well (Colombian _cuentas de
cobro_, Mexican _facturas_, Brazilian _faturas_, e-mails, WhatsApp chats), but they can be
confidently wrong, they can be steered by text inside the document, they are weak at arithmetic
and dates, and their answers are not reproducible. A decision about money must be re-derivable
from its inputs.

## Decision

Split the agent at a hard boundary:

1. **Reader (LLM).** Turns the document's text into a typed `ExtractedBill` with a confidence per
   field group, validated by zod
   ([`reader.ts`](../../apps/api/src/reading/reader.ts), [`prompt.ts`](../../apps/api/src/reading/prompt.ts)).
2. **Line matcher (LLM).** Maps each bill line to a term of the vendor's contract, with a
   confidence and a reason ([`matcher.ts`](../../apps/api/src/reading/matcher.ts)). It sees line
   descriptions, units and quantities and the terms' ids, kinds and titles: **no prices, no
   evidence, no policy**.
3. **Engine (code).** `decide(context) → Decision` in
   [`engine.ts`](../../packages/domain/src/engine.ts), a pure function: no I/O, no clock, no
   randomness. Hours, amounts, rates, caps, dates and FX are computed here, money in integer minor
   units (BigInt where a product could overflow).

The vendor is resolved only by its normalized tax id, never by a name. Any reading below 0.85 or
any match below 0.80 confidence escalates.

## Consequences

- If the reader or the matcher is wrong or manipulated, the worst case is a payment to a
  registered vendor, at its registered destination, for work the evidence proves, at or below the
  contract's rate and cap. Property tests assert this over arbitrary readings.
- The same context always yields the same decision; the eval and the independent checker can
  re-derive it.
- Judgments that cannot be written as code ("does this look legitimate?") are not automated; they
  escalate.
- The model is swappable (DeepSeek direct, OpenRouter, another provider) without touching the
  decision logic.
