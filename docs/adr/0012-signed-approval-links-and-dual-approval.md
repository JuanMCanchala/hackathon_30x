# ADR-0012: One-time signed approval links and dual approval

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Escalations are only useful if approvers act quickly, usually from a phone. Large payments
deserve four eyes. Integrating WhatsApp or Slack requires third-party accounts the jury does not
have.

## Decision

- Each escalation creates an approval request with `requiredApprovals = 1`, or `2` when the USD
  amount exceeds the policy's dual-approval threshold. Approvals must come from **distinct**
  users with the approver role.
- An approver can receive a **signed link** (`/aprobar/<token>`): an HMAC-SHA256 token bound to the
  request, the approver and an expiry, stored hashed and **single use**. The link opens a
  mobile-first page with the summary on top and two buttons. The UI also renders it as a QR code.
- The link is channel-agnostic: it can be sent by email, WhatsApp, Slack or SMS without changing
  the backend.

## Consequences

- The demo shows a real phone approving a payment in seconds, with no third-party setup.
- Leaked links expire, work once, and only for the approver they were issued to.
- Production would add authentication on top; the link is a capability, not an identity system.
