# Design — Recibido

Visual identity for the landing (`/`), the app and the contractor portal. Written before the UI
was built; the UI follows it. Kit used: impeccable (craft floor), design-taste-frontend (taste
rules), emil-design-eng (motion). Read their SKILL.md files in `~/.claude/skills/<name>/`.

## Concept: "la prueba"

Recibido pays only what it can prove. The one protagonist of the whole product is the
**proof bar**: a thick horizontal bar as long as what the contractor billed, where the part backed
by evidence is solid ink and the unproven remainder is hatched. Each evidence item (a Toggl entry,
a merged PR, an accepted deliverable) is a tick segment inside the solid part. The bar answers the
product's question at a glance: _how much of this bill is proven?_

Beside it lives the **receiving stamp**: the outcome, set in heavy expanded capitals inside a
rounded rectangle with a 1.5px border, rotated −2°, in the outcome's ink. It is the only rotated
element in the product.

Everything else is quiet: paper, ink, tables that read like a ledger, numbers in a mono face.

Bans (from the user's lessons): no marquee, no counters that tick up, no word-by-word reveals, no
loader, no cursor effects, no three identical feature cards, no beige/cream luxury, no purple
gradient, no Inter, no thin type, no decorative serif, no noisy textures. One strong gesture
(the bar filling and the stamp landing), a clean rest.

## Tokens

Define on `:root` and redefine under `[data-theme='dark']` (set before paint, like Mandato).

| Token        | Light     | Dark      | Use                                               |
| ------------ | --------- | --------- | ------------------------------------------------- |
| `--paper`    | `#f3f4f1` | `#0f1412` | page background                                   |
| `--sheet`    | `#ffffff` | `#161c19` | cards, tables                                     |
| `--ink`      | `#0f1f1a` | `#e9eeea` | text, the solid part of the proof bar             |
| `--ink-2`    | `#45524c` | `#a9b5ae` | secondary text                                    |
| `--ink-3`    | `#5f6b65` | `#8c9891` | captions, axis                                    |
| `--rule`     | `#dfe3de` | `#26302b` | borders                                           |
| `--stamp`    | `#c0361f` | `#ff6a4d` | brand: the stamp ink, primary actions, focus ring |
| `--pay`      | `#125e33` | `#5fd391` | PAY                                               |
| `--part`     | `#0d7480` | `#3cc0cc` | PAY_PART                                          |
| `--ask`      | `#8a5800` | `#e6a63a` | ASK_VENDOR                                        |
| `--escalate` | `#cc1f52` | `#f25a80` | ESCALATE                                          |
| `--hold`     | `#4c5560` | `#9aa4b0` | HOLD                                              |

Each outcome also has a `-tint` (10–14 % on the sheet). Validate text contrast ≥ 4.5:1 for every
outcome ink on its tint and on the sheet, in both themes, and check the five against
deuteranopia/protanopia (the `dataviz` skill has a validator); adjust lightness, not hue family, if
a pair fails. Outcome is never carried by color alone: the stamp always has its word.

Validated when the web was built (Task 12): the first values of `--stamp`, `--pay`, `--ask` and
`--ink-3` fell under 4.5:1 in light, and PAY/ESCALATE were too close under deuteranopia, so their
lightness moved to the values above. Every outcome ink now passes 4.5:1 on the sheet, the paper and
its 10 % tint in both themes, and the closest pair under simulated deuteranopia or protanopia is
ΔE ≥ 6 (white on `--stamp` is 5.5:1).

## Type

- **Archivo** (variable, with width axis) for everything: headings at 800–900 weight; the stamp
  and big numbers at width 125 (expanded), uppercase, tracking +2 %. Body 16 px / 1.5 at 450.
- **JetBrains Mono** for amounts, hours, references (`RCB-0007`, `#3`), timestamps; tabular nums.
- Install with `@fontsource-variable/archivo` and `@fontsource-variable/jetbrains-mono` (fonts
  ship with the app, nothing loaded from Google at runtime).
- Scale: 12 · 14 · 16 · 20 · 28 · 40 · 64 · 96 (landing hero only).

## Layout

- App shell: left rail 248 px on ≥ 1024 px (logo, nav, demo clock "Hoy en la demo: 3 oct 2026",
  user "Paula Herrera · Finanzas"); a top bar with a menu on phones. Content max 1200 px.
- Bills list reads like a ledger: one row per bill, the proof bar inline (120 px) between vendor
  and amount; status chip at the end. On phones the row becomes a two-line card with the bar full
  width.
- Receipt: the stamp and the reason first (one sentence, 20 px); then the proof bar full width
  with its evidence ticks and a legend "92 h con prueba · 68 h sin prueba"; then lines, checks,
  "Para pagarla", reading, payment plan, conversation, history.
- Reconciliation: two columns on desktop, bank lines left and the selected chain right as a
  vertical chain of five linked cards (línea del banco → pago → cuenta → contrato → evidencia);
  stacked on phones.
- Spacing on a 4 px grid; radius 10 px on cards, 6 px on chips, 999 px never (no pills).
- Balance: every screen at 1440 px and 390 px has no dead zones; check a 3×3 grid of the capture.

## Motion (emil-design-eng)

- The proof bar fills left to right one tick at a time when it first enters (40 % visible): each
  tick grows over 260 ms, staggered min(90, 640 / (n − 1)) ms, `cubic-bezier(0.22, 1, 0.36, 1)`, so
  the whole fill ends within 900 ms even with 20 ticks; the hatched remainder is static.
- The stamp lands after the bar: scale 1.12 → 1, opacity 0 → 1, rotate −5° → −2°, 220 ms, the same
  ease-out. Only on a decision change, never on re-render or poll refresh.
- Status chips cross-fade 150 ms when a bill changes status live (the PR merge moment).
- Buttons: 120 ms background/transform; press scales to 0.98.
- Entrances (`.rise-in`: fade + rise 6–14 px, `--dur` 240–400 ms, ease-out, `--delay` for a
  stagger capped at 320 ms). Landing: the hero (headline, line, actions) once on load; the five
  outcome stamps in "Cómo decide" land one after another (70 ms) the first time the list is 40 %
  visible; the "Medido" figures fade up (never count up). App: each screen rises 8 px on
  navigation; ledger rows stagger 30 ms on first show; the reconciliation chain's five cards
  appear 60 ms apart when a line is selected. Live lists (activity, conversations, decision
  history, ledger) animate only items that arrive while you watch (`useFresh` in
  `apps/web/lib/motion.tsx`), never on a poll; a tour step completed live pops its check mark.
- Not done on purpose: no hover lift on cards (no card is clickable; a lift would promise a
  click), nothing loops, no counters, no loaders.
- `prefers-reduced-motion: reduce` → no fill, stamp or entrance animation, final state
  immediately.

## Landing (`/`, Persuade)

1. Hero: left, "Ningún pago sin prueba de entrega." (64–96 px, 900) and one line: "Recibido paga
   las cuentas de servicios solo por el trabajo que puede probar, le pide al contratista lo que
   falta y te deja a ti solo lo que se sale de las reglas." CTA "Ver la demo" → `/recorrido`,
   secondary "Cómo decide". Right: the live specimen: Daniela's bill (dataset `oct-03`, 160 h at
   COP 130.000) with the proof bar filling as her 20 Toggl entries for September land (92 h; she
   has no PRs), then the stamp "PAGAR UNA PARTE", the engine's own sentence and the vendor message.
   Replays with "Repetir"; captioned as an example from the dataset.
2. "El problema": three-way match exists for goods; for services there is no receiving note — a
   ledger row comparison: Bienes (orden · recepción · factura ✓) vs Servicios (contrato · ¿? ·
   cuenta).
3. "Cómo decide": three moves (Lee, Prueba, Decide), then the five outcomes as a ledger list, one
   row each (stamp column and one line). A single row of five overflowed at 1440 px with
   "ESCALAR A UNA PERSONA".
4. "Medido, no prometido": numbers only from `/api/v1/overview` after the demo ran, else a
   sentence pointing to `pnpm eval` and the README table.
5. "Para Blinka": local rails (Bre-B, SPEI, Pix, ACH), yield-aware timing, bank reconciliation —
   one row each, mono numbers.
6. Footer: repo, docs, "Datos ficticios de Altamar Labs Inc.".
