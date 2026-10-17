# ADR-0007: Money as integer minor units; conservative, versioned FX

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Bills arrive in COP, MXN, BRL and USD; limits and budgets are in USD. Floating-point arithmetic
causes off-by-a-cent errors, and an FX conversion that rounds down could let a bill slip under a
limit it actually exceeds.

## Decision

- Amounts are stored and computed as **integers in minor units** (ISO 4217 exponents; all four
  currencies use 2). Parsing from text uses decimal strings, never `parseFloat`.
- FX rates are part of the **policy version** (`unitsPerUsd`, decimal strings, with an `asOf`
  date). In this project they are simulated reference rates and labelled as such.
- Conversion to USD uses `BigInt` arithmetic and **rounds up** (ceil) — when comparing against a
  limit, the bill is never made to look cheaper than it is.
- Each decision stores the FX snapshot it used.

## Consequences

- Limit checks are exact and biased toward safety by at most one cent.
- Changing rates is an auditable policy change, not a silent background update.
- Real deployments would plug a rate provider behind the same policy field.
