# ADR-0017: A second reader — DeepSeek V4.1 Flash on Fireworks through an OpenAI-compatible port

- **Status:** Accepted
- **Date:** 2026-10-16
- **Amends:** [ADR-0010](0010-claude-extraction-with-record-replay.md)

## Context

For the hackathon the team runs the reader on Fireworks instead of Anthropic. The reader is a port
(ADR-0002, ADR-0008): the engine only consumes an `ExtractedInvoice`, so the language model behind
it can change without touching a rule. Fireworks serves DeepSeek V4.1 Flash, which accepts images,
through an OpenAI-compatible API with JSON-schema constrained outputs.

Three findings shaped the adapter:

- pdf.js (via `unpdf`) drops some glyphs from the generated PDFs — figures in certain fonts, so a
  CFDI's amounts came out as `$ $`. Poppler's `pdftotext` keeps every character and the columns.
- Letter-spaced headings come out spaced (`C C - 2 0 2 6 - 0 8`) in any text layer; a person
  reading the page does not see them that way.
- In a chat pasted without its WhatsApp header, DeepSeek took the greeting ("Hola Laura") for the
  customer, and the addressed-to-us rule escalated a bill that fit its mandate. The prompt now
  says a greeting is never the bill-to (extractor version 2, every recording re-made).

## Decision

- A `LiveReader` port (`read()` that throws, `extract()` that never does) with two adapters:
  `ClaudeExtractor` and `FireworksExtractor`. `LLM_PROVIDER=auto` picks Anthropic when its key is
  set, otherwise Fireworks; `anthropic` or `fireworks` force one. The policy compiler ("escríbelo
  en español") follows the same choice.
- `FireworksExtractor` calls `/chat/completions` with plain `fetch` (no SDK), `temperature: 0`,
  and `response_format: json_schema` generated from the same Zod schema, which validates the answer
  again on our side. Images go as data URLs. **A PDF goes twice**: as page images rendered by
  `pdftoppm` (what a person sees) and as its exact `pdftotext -layout` text layer (characters, and
  text a person cannot see, which the reader must report).
- Recordings store the provider and model. The committed recordings of the 48 dataset documents
  are DeepSeek V4.1 Flash's; the interface names the model on every receipt.
- Poppler ships in the API image and runs in CI. Without it the adapter falls back to the pdf.js
  text layer and no page images.

## Consequences

- End to end with DeepSeek's recorded readings: 49/49 decisions correct and 480/480 critical
  fields read right ([EVALUATION.md](../EVALUATION.md)) — the same result as the perfect reader.
- The jury can replay that run without any key, and run the product live with either key.
- The deterministic injection scanner still uses pdf.js; its phrases are letters, which pdf.js
  keeps. Moving it to Poppler would be a small, separate change.
- Claude keeps native PDF input when it is the provider; nothing in the engine or the receipts
  depends on which model read the document.
