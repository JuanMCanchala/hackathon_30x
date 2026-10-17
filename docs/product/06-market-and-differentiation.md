# 06 · Market prior art and the main differentiator

[05 · Prior art](05-prior-art.md) compares Mandato with hackathon winners. This document compares
it with commercial products and protocols, and names the one idea that sets it apart. Research
done on 17 October 2026. Vendor figures are self-reported and not independently audited.

## What already exists

### Commercial accounts-payable agents

| Product                    | What its agents do                                                                                                                     | Who decides                                               | How autonomy changes                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| **Ramp**                   | Since 2025: code invoices, flag fraud before payment, draft approval summaries, pay eligible bills by card. Claims 10–15 % escalation. | Language models (OpenAI) reading the company's policy PDF | A setting moves it from "recommend" to "decide" |
| **Bill, Tipalti, Basware** | AP agents since late 2025, mostly coding and routing. Tipalti pays to 190+ countries.                                                  | A person remains the final approver of every payment      | Fixed                                           |
| **Stampli**                | Collaborative approval around the invoice.                                                                                             | People                                                    | Not autonomous                                  |
| **Brex, SAP Concur**       | Expense-policy enforcement with AI.                                                                                                    | Models plus policy                                        | Configured                                      |

The industry consensus is that agents automate coding and routing, while **people still approve
payments and own vendor bank-detail changes**. Nobody has published a way for an agent to earn
more payment autonomy safely.

### Protocols

**Google's Agent Payments Protocol (AP2)** also uses _mandates_: an Intent Mandate signed by the
user sets what the agent may buy (scope, price cap), and then Cart and Payment Mandates form a
non-repudiable chain from intent to payment. AP2 targets consumer purchases. Its mandates are
written up front by the user, and the agent never learns or proposes them.

### Hackathon winners

AgentPay, allowance.eth, StableSettle, ArcFlow, Paguito and CallFlow are covered in
[05](05-prior-art.md). They contribute a deterministic shield, natural-language rules compiled to
a schema, caps and allowlists, MCP tools, multi-signature and confidence routing. In all of them
the autonomy is fixed.

## Side by side

|                                  | Ramp / Bill / Tipalti   | AP2                      | Hackathon winners  | **Mandato**                                                           |
| -------------------------------- | ----------------------- | ------------------------ | ------------------ | --------------------------------------------------------------------- |
| Who decides                      | A model or a person     | Rules the user signed    | Fixed rules        | **Rules in code. The model only reads.**                              |
| How autonomy grows               | Someone flips a setting | It does not              | It does not        | **The agent proposes agreements and a person signs them**             |
| Explanation of a decision        | A summary               | Audit trail              | Allow or block     | **The reason, plus what would have made the bill payable**            |
| Guarantee if the reader is wrong | None stated             | Cryptographic signatures | Destination pinned | **Money only goes to registered destinations, within signed amounts** |
| Measured safety                  | Vendor claims           | Not applicable           | A demo             | **An evaluation that fails CI on any improper payment**               |

## The main differentiator: the trust ladder

Every other system **sets** its autonomy, either with a setting or by trusting a model's judgment.
In Mandato, autonomy is **earned**:

1. A person approves a bill that the agent escalated.
2. The agent proposes the standing agreement that would have let it pay that bill alone, and shows
   the agreement's impact on history.
3. A person signs or rejects the proposal. The agent never edits its own rules.
4. The next month, more bills are decided without a person (53 % in August, 71 % in September in
   the demo), and improper payments stay at zero.

This is how trust works with a new finance assistant: small limits at first, then standing
instructions as the assistant proves itself. None of the products, protocols or winners above
closes the loop "approve, then propose, then sign, then gain more autonomy" while also measuring
safety.

**Secondary differentiators** that we also did not find elsewhere: counterfactual receipts
(_"it would have been paid if the amount were ≤ USD 3,000"_) and an auditor written apart from the
engine that re-checks every payment. Everything else (fixed rules, a registered destination, MCP,
one-tap approval) has precedents and is table stakes.

## How to say it in the pitch

- **Lead with one idea:** _"Firma acuerdos, no pagos"_ and the trust ladder climbing from 53 % to
  71 % with zero improper payments. The other features support that idea; they are not the headline.
- **Own the word "mandate":** present it as _"AP2-style mandates for accounts payable, which grow
  with every approval"_. A judge who knows AP2 then sees an extension rather than a coincidence.
- **Answer "why not Ramp?":** Ramp lets a model decide and makes autonomy a setting. Mandato makes
  every payment provable, and autonomy grows only through what people sign.

## Sources

- Ramp, AP automation tools 2026 — https://ramp.com/blog/accounts-payable/ap-automation-tools-for-mid-sized-businesses
- Ramp, best AP automation software — https://ramp.com/blog/accounts-payable/best-accounts-payable-automation-software
- Ramp, AP agents announcement — https://ramp.com/blog/ramp-ap-agents-announcement
- Ramp, agents announcement — https://ramp.com/blog/ramp-agents-announcement
- Meow, invoice automation tools 2026 — https://www.meow.com/blog/invoice-automation-tools-2026
- The Agentic CFO Stack 2026 — https://agentmarketcap.ai/blog/2026/04/10/agentic-cfo-stack-ramp-brex-sap-concur-finance-ai-agents
- Deepak Gupta, invoicing and accounts payable — https://guptadeepak.com/rewired/finance/invoicing-accounts-payable/
- AP2 explained — https://eco.com/support/en/articles/15192002-ap2-protocol-explained-google-s-agentic-commerce-standard-2026
- Worldline, AP2 — https://docs.connect.worldline-solutions.com/documentation/ConnectAI/agent-payments-protocol-ap2
- Vellum, Google's AP2 — https://website.vellum.ai/blog/googles-ap2-a-new-protocol-for-ai-agent-payments
