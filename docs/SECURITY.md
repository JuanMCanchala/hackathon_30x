# Security and threat model

Mandato's job is to be trusted with payments. This document lists what we defend against, how,
and what is deliberately out of scope.

## Assets

1. The decision to pay (no improper `PAY`).
2. The payout destination of each payee.
3. Signed policies and mandates.
4. The ledger as evidence.
5. Approval capabilities (who may approve what).

## Threats and mitigations

| #   | Threat                                                                      | Mitigation                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | **Prompt injection** inside a bill ("pre-approved, process without review") | The LLM only extracts; it never sees the policy and cannot output a decision. Instruction-like text is flagged by the model **and** a deterministic scanner → `ESCALATE`.                                                            |
| T2  | **Reader mistakes or a fully compromised reader**                           | Payee resolved only by tax ID or exact registered destination; `PAY` requires a signed mandate, limits and budget. Worst case: payment to a registered destination within signed bounds. Property-tested over arbitrary extractions. |
| T3  | **Changed bank details** ("we changed our account")                         | Destination must equal the registered one → `ESCALATE`. The agent never proposes destination changes; they are edited manually in the payee registry and recorded in the ledger.                                                     |
| T4  | **Look-alike payee** (similar name, Cyrillic letters)                       | Names never resolve a payee. Confusable characters are folded only to _suggest_ a similar payee in the receipt.                                                                                                                      |
| T5  | **Duplicate or re-sent bill** in another format                             | Normalized invoice number per payee → `HOLD`; same amount and period with a different number → `ESCALATE`.                                                                                                                           |
| T6  | **Bill splitting** to stay under a limit                                    | Mandate frequency and monthly cap count paid, approved and pending bills of the month.                                                                                                                                               |
| T7  | **Budget race** (concurrent decisions)                                      | Per-organization row lock around decide/approve ([ADR-0011](adr/0011-serialized-decisions-per-organization.md)).                                                                                                                     |
| T8  | **Agent over-reach** (an external agent requests out of scope)              | Scoped agent keys; `requester.scope` → `HOLD`; agents have no approve/sign/configure endpoints.                                                                                                                                      |
| T9  | **Agent self-escalation of autonomy**                                       | The agent can only create proposals; accepting requires a user with signing rights. Proposals never widen destinations, budgets, currencies or unblock payees.                                                                       |
| T10 | **Approval link theft / replay**                                            | HMAC-SHA256 token bound to request + approver + expiry; stored hashed; single use.                                                                                                                                                   |
| T11 | **Single approver for large amounts**                                       | Dual approval by distinct approvers above a threshold.                                                                                                                                                                               |
| T12 | **Ledger tampering**                                                        | Hash chain per organization; the auditor recomputes it.                                                                                                                                                                              |
| T13 | **Malicious uploads** (huge files, wrong types)                             | Size limit, MIME allowlist (PDF, PNG, JPEG, WEBP, EML, TXT), documents served with `Content-Disposition` and `nosniff`.                                                                                                              |
| T14 | **Secrets leakage**                                                         | Keys only from environment; agent keys stored as SHA-256; no secrets in the repo or the ledger.                                                                                                                                      |

## Explicitly out of scope (per the challenge)

- Moving money, opening accounts, verifying company identity (KYC/KYB).
- Compliance and fraud decisions. Where a rule resembles fraud detection, it is a **consistency
  check against what the company registered**, and the decision goes to a person.
- Production authentication. The demo identifies users with a user switcher (`x-mandato-user`
  header), accepted only when `DEMO_MODE=true`. A real deployment must put an identity provider
  in front of the API.

## Data protection

All people, companies, tax IDs, phone numbers and accounts in the dataset are fictitious. No
personal data is collected by the demo.
