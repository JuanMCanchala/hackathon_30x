# ADR-0010: Extraction with Claude, with a record/replay cache for reproducible runs

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Bills arrive as PDFs, phone photos, emails with attachments and chat messages. A vision-capable
LLM reads all of them with one prompt. But the jury and CI must be able to run the system without
an API key, and evaluation results must be reproducible.

## Decision

- `ClaudeExtractor` sends the document (PDF as a document block, images as image blocks, emails
  and chats as text plus attachments) with a strict JSON schema for `ExtractedInvoice`, including
  per-field confidence and a flag for text addressed to an automated system.
- `RecordingExtractor` wraps it and stores each result in `packages/dataset/extractions/` keyed by
  the SHA-256 of the document and the extractor version.
- `ReplayExtractor` serves stored results by hash. Without `ANTHROPIC_API_KEY`, the API uses
  replay only; a document with no stored extraction is escalated as unreadable (deny-by-default).
- A deterministic scanner also flags instruction-like text in any text we can read ourselves
  (emails, chats, extracted text), so prompt-injection detection does not rely on the LLM alone.

## Consequences

- The dataset's real Claude extractions are committed: anyone can replay the exact end-to-end
  evaluation offline.
- New uploads need an API key; without it the product still works and stays safe (unreadable →
  escalate).
- Re-recording is a single command (`pnpm extractions:record`).
