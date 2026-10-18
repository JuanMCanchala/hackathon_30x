# Building a scene (worker brief)

You build one or more scenes of the OndAI pitch film as **fragments** in `src/scenes/`. A generator wraps each fragment in a HyperFrames sub-composition with the shared kit. Read, in this order: `design.md` (brand for video), `STORYBOARD.md` (your frames: timing, content, facts), `src/kit.css` + `src/kit.js` (shared pieces), and the two finished examples `src/scenes/f02-reveal.html` and `src/scenes/f03-radar.html`. Match their quality and idiom.

Plugin CLI (use this instead of `npx hyperframes`):
`HF="node /home/jucollas/.claude/plugins/cache/hyperframes/hyperframes/0.8.171/skills/hyperframes/scripts/plugin-cli.mjs"`

Animation recipes named in the storyboard live in `/home/jucollas/.claude/plugins/cache/hyperframes/hyperframes/0.8.171/skills/hyperframes-animation/rules/<name>.md` — read the ones your frame cites before writing its motion.

## Work in your own copy

Several workers run at once, and `index.html` is regenerated per window, so never build in the main project.

```bash
MAIN=/home/jucollas/Code/hackathon_30x/output/ondai-pitch
W=/tmp/claude-1000/-home-jucollas-Code-hackathon-30x/0b4a6e6e-74d1-4a0e-aca5-6548aeb791cc/scratchpad/<your-worker-name>
rsync -a --exclude renders --exclude .hyperframes $MAIN/ $W/
cd $W
node tools/build-scenes.mjs                    # builds compositions/<id>.html for every fragment
node tools/build-index.mjs --window <a>,<b>    # index.html with only the scenes starting in [a, b)
$HF check .                                    # must pass: 0 errors
$HF snapshot --at <window-local times>         # then LOOK at the contact sheet it prints
```

The window is in global seconds and must start at your first scene's start; snapshot times are relative to the window start. When your scenes are done, copy **only your fragment files** back: `cp src/scenes/<id>.html $MAIN/src/scenes/`. Never edit the kit, tools, assets or other scenes in `$MAIN`; if the kit lacks something, add a scene-local helper in your fragment. Never run `render`. The machine has little free memory: run one snapshot or check at a time, with few `--at` times (≤ 12).

## Fragment format

```html
<!-- scene {"id":"f08-sources","start":70.0,"duration":12.0} -->
<!-- sfx [{"t":0.0,"type":"whoosh"},{"t":5.4,"type":"riser-short"}] -->
<style> /* scene CSS: every id and class prefixed with the scene id: #f08-…, .f08-… */ </style>
<div class="k-stage" id="f08-stage"> … markup … </div>
<script> /* builds `tl` (already created, paused). Available: root, $, $$, K, gsap */ </script>
```

- Times inside a scene are **local** (0 = scene start). `start`/`duration` in the header must match the storyboard.
- `__CAPTURE_<take>` in the script inlines `assets/capture/<take>.json` (the pointer log of a recording).
- The `sfx` comment lists the scene's sound cues (local time). Types: `whoosh`, `whoosh-long`, `whoosh-back`, `swipe-right`, `swipe-left`, `pop`, `pop-high`, `pop-low`, `tick`, `click`, `clock`, `clock-low`, `ping`, `riser` (1.6 s, place it so it ENDS on the hit), `riser-short` (0.9 s), `impact`, `impact-soft`, `shimmer`, `tape-stop`, `final-hit`; optional `"gain"` (default 1). Put a `whoosh` at `t: 0` for your entry (unless the storyboard says the move is continuous), a `click` on every replayed pointer click (time = offset + (t − mediaStart)), pops on cards/labels, risers before key figures, impacts on key push-ins. Sounds must match a visible event; keep it sparse and musical.

## The kit (see src/kit.js)

- `K.enter(tl, el, at)` / `K.exit(tl, el, at)`: the film's handoff (arrive from the right, leave to the left, short blur). Default: enter the stage at 0, exit at `duration − 0.5`.
- `K.frame(view, s, cx, cy, z)`: camera for a capture inside a `.k-screen` → set on its `.k-cam` (`transform-origin: 0 0`). Captures are 1440 × 810 CSS px pages at 2×; a 1600 × 900 screen gives `s = 1600/1440`. Stills are full pages: `<img style="width:1600px">` (their height is page height × s). Element boxes for stills are in `assets/stills/index.json` (CSS px, page space).
- `K.cursor(tl, {cursor, ripple, log, offset, mediaStart, s, from, until})`: replays the recorded pointer on the real element at the real moment (cursor and ripple live in the same `.k-cam` as the video).
- `K.sweep(tl, el, start, duration)`: the brand gradient sweep through a `.k-grad` word (key words only).
- `K.count(tl, el, {from, to, start, duration, fmt})`: number count (use Spanish formatting: `10,5`, `1.715`, `USD 0,006`).
- `K.drift(...)`, `K.plane(size)`, `K.cursorSvg`. Classes: `.k-stage`, `.k-screen`, `.k-cam`, `.k-glow`, `.k-glass`, `.k-pill(-marker|-cream|-dark|-lav)`, `.k-eyebrow`, `.k-display`, `.k-light`, `.k-mono`, `.k-grad`, `.k-cursor`, `.k-ripple`.

## Composition contract (HyperFrames)

- Scenes are transparent: the dark stage (glows, grain, vignette) is global. Don't paint a full-frame background; local `.k-glow`s are fine.
- One paused timeline (given). Build everything synchronously; no async, no `Date`, no `Math.random` (use a seeded PRNG), no DOM measuring at tween time.
- `gsap.fromTo` for entrances; never put a CSS `transform` on an element GSAP also moves; never tween `autoAlpha`/`visibility`/`display` on a `.clip`.
- Timed media/images inside the scene: `class="clip" data-start data-duration` (local); videos also `data-media-start`, `muted playsinline`, and `data-hf-media-start-basis="local"` when `data-start > 0`. Don't nest a timed element inside another timed element.
- Unique ids across the film (prefix with the scene id). No `<br>` in body text; size and wrap text with `max-width`.
- Intentional overflow (glows, waves, oversized shots) gets `data-layout-allow-overflow`.
- Fonts: only `'Hanken Grotesk'` and `'JetBrains Mono'` (declared by the kit). Video scale: labels ≥ 22 px, body ≥ 30 px, headlines 72–200 px. Text must pass WCAG AA (the check measures it).

## Craft

- The voice leads: a word appears when it's said (± 0.15 s), holds ≥ 1.2 s, and the frame never shows more text than the voice needs. Silences are for motion and music, not more text.
- At most one push-in per sentence (100 % → 115–130 %), strong ease-out, light overshoot; horizontal travel between sections.
- Layered frames: a background glow, the midground content, foreground accents (mono labels, rules, small data). Vary eases and directions; overlap entrances.
- Honesty: every figure, name and screen is in STORYBOARD.md. Real UI only from `assets/`; your graphics must read as graphics, never as fake app screens or a cursor clicking something that isn't there. Label methodological limits where the storyboard says so.

## Done means

`$HF check .` passes with 0 errors on your window, you looked at a snapshot contact sheet covering each phrase of your frames and fixed what was off (clipped text, overlaps, empty frames, unreadable text), and your fragments are copied back to `$MAIN/src/scenes/`. Report: the scenes, what each shows when, the sound cues, anything you could not do.
