# 03 · Personas and journeys

All names, companies, tax IDs and bank details in this project are fictitious.

## The company: Andes Labs Inc.

A Delaware C-corp headquartered in Miami with ~40 people. Engineering and design are distributed
across Colombia, Mexico, Brazil and Argentina. Its treasury is a USD account; it pays contractors
and vendors in COP (Bre-B), MXN (SPEI), BRL (Pix) and USD (ACH/wire). Accounts payable: 15–20
bills a month.

## Personas

| Persona               | Role in Mandato         | What they need                                                               |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| **Laura Méndez**      | Finance operations      | Stop retyping bills; see at a glance what was paid, held or is waiting.      |
| **Martín Ocampo**     | CFO — approver, signer  | Approve exceptions from the phone in seconds; sign standing agreements once. |
| **Sofía Herrera**     | Controller — approver   | Second approval for large payments; prove to the auditor nothing slipped.    |
| **Agente de compras** | External AI agent (MCP) | Request payments for software subscriptions within a narrow scope.           |

## Journey 1 — A normal month (no human involved)

1. Valentina emails her _cuenta de cobro_ for August.
2. Mandato reads it, resolves her by tax ID and Bre-B key, finds her signed mandate and checks
   amount, currency, frequency, limits and budget.
3. Outcome **PAY**. The receipt says: _"Pagada sola: coincide con el acuerdo firmado con Valentina
   Ríos (COP 14.000.000 al mes, 1 factura por mes) y está dentro del límite y del presupuesto."_
4. Laura sees it in the "Pagadas" tab. Nobody had to do anything.

## Journey 2 — An exception (human in the loop)

1. Código Norte bills MXN 185,000 (≈ USD 10,000): above the USD 5,000 autonomous limit.
2. Outcome **ESCALATE**. Martín gets a one-tap approval link: summary on top (who, how much,
   which rule, what was agreed), "Aprobar" / "Rechazar".
3. Martín approves from his phone. The dashboard updates live.
4. The agent proposes: _"Código Norte factura MXN 185.000 cada mes. ¿Firmar una excepción para
   pagarle hasta ese monto sin aprobación? Exposición máxima: USD 10.000/mes."_
5. Martín signs. In September, Código Norte's bill is paid without escalation.

## Journey 3 — Something is off (HOLD)

1. Mateo re-sends his September invoice by WhatsApp ("te reenvío la factura").
2. Same payee, same normalized invoice number as an invoice already paid.
3. Outcome **HOLD**: _"Frenada: la factura F-2026-0915 de Mateo Herrera ya se pagó el 3 sep."_

## Journey 4 — Proving it (auditor)

1. Sofía opens "Auditoría" and runs the auditor.
2. It re-verifies the ledger's hash chain and re-checks every payment against the invariants with
   code independent from the engine.
3. Result: _"0 pagos fuera de las reglas · cadena íntegra · 34 decisiones verificadas"_. She
   exports the CSV for the reconciliation spreadsheet.

## Journey 5 — Another agent wants to pay (MCP)

1. The company's procurement agent (Claude with Mandato's MCP server) calls `solicitar_pago` for a
   SaaS renewal.
2. Mandato applies the same rules plus the agent's scope (software only, ≤ USD 1,000 per request).
3. The agent receives the decision and the receipt text; if escalated, it tells the user a human
   must approve.
