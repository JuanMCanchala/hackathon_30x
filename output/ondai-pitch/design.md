# OndAI pitch: design

Brand truth comes from `docs/design-system.md` in the repo (the landing and the app share it). This file adapts it to a 1920 × 1080 video.

## World

- **Dark cinematic stage** for the story, the type and the graphics: `--noche-deep #140e0d` with a slow mesh of glows (marker orange, lavender, indigo, ember). Grain at ~5 %, a soft vignette.
- **The product stays light and real**: the app and the landing are shown as captured (cream `#fffdf9` / arena `#efebe4`), as floating screens over the dark stage, with a 1 px light border, a long shadow and a soft orange or lavender glow behind.
- Never a full-screen linear gradient on dark (banding): only radial glows.

## Color

| Token        | Hex       | Use                                                  |
| ------------ | --------- | ---------------------------------------------------- |
| noche-deep   | `#140e0d` | stage background                                     |
| noche        | `#201515` | dark cards                                           |
| ink-on-dark  | `#fffdf9` | main text on the stage                               |
| ink-2-dark   | `#c5c0b1` | secondary text on the stage                          |
| ink-3        | `#8a847c` | notes, axes                                          |
| marker       | `#ff4f00` | the signal: key figures, «Entra ya», the main wave   |
| marker-dark  | `#ff5f17` | marker on dark                                       |
| lavender     | `#c1b7ff` | second voice: labels on dark, highlighted cards      |
| brand        | `#3b33a8` | indigo for meters and links (light surfaces only)    |
| lang EN      | `#5a54d6` (on dark `#c1b7ff`) | English                  |
| lang PT      | `#2b8a3e` (on dark `#8fd8a3`) | Portuguese               |
| lang ES      | `#ff4f00` (on dark cream)     | Spanish                  |

Stages keep their names next to their color: Emergente `#1e6b3a`/`#e6f2e8`, En crecimiento `#3b33a8`/`#e6e1ff`, Saturado `#8a5a00`/`#fff0d4`, En declive `#5e5b52`/`#ecebe5`.

**Gradient words** (requested): marker `#ff4f00` → `#ff8a4c` → lavender `#c1b7ff` → back to marker, swept slowly through the letters while the word holds. Only the key word carries it; the rest of the line stays solid cream.

## Type

- **Hanken Grotesk** 300 / 400 / 500 / 700 / 800 for everything; headlines pair a light first line with an 800 second line, tracking −0.035 to −0.05 em.
- **JetBrains Mono** 400 / 500 / 700 for eyebrows, source labels and data captions, uppercase, +0.1 em.
- Video scale: hero 120–200 px, headline 72–110 px, body 30–40 px, labels 20–26 px.

## Shape and motion

- Radii 28 / 18 / 14 px, pills 999 px. Borders 2 px on dark.
- Signature: the paper plane (`PlaneMark`) and the thick orange wave.
- Motion: strong ease-out entrances (`expo.out`, `power4.out`, light `back.out(1.4)` overshoot), scene handoffs as horizontal travel with a short blur, at most one push-in per sentence (100 % → 115–130 %), synced to the voice.
