// OndAI pitch kit: seek-safe helpers shared by every scene. tools/build-scenes.mjs puts this at
// the top of each scene's script (inside one function scope), so scenes call K.* directly.
const K = {
  W: 1920,
  H: 1080,

  // Camera over a capture shown in a viewport `view` ({w, h}) at `s` display px per capture CSS
  // px. Returns the transform for the .k-cam wrapper that centers capture point (cx, cy) at zoom
  // z (z = 1 is the capture at its display size). transformOrigin is 0 0 on .k-cam.
  frame(view, s, cx, cy, z = 1) {
    return { x: view.w / 2 - z * cx * s, y: view.h / 2 - z * cy * s, scale: z };
  },

  // Sweep the brand gradient through a .k-grad word for as long as it holds (gradient-text-sweep).
  sweep(tl, target, start, duration, loops = 1) {
    const one = duration / loops;
    for (let i = 0; i < loops; i++) {
      tl.fromTo(
        target,
        { backgroundPosition: '100% 50%' },
        { backgroundPosition: '0% 50%', duration: one, ease: 'none', immediateRender: i === 0 },
        start + i * one,
      );
    }
  },

  // Count a number up inside `el` (counting-dynamic-scale). fmt turns the value into text.
  count(tl, el, { from = 0, to, start, duration = 1.2, ease = 'power3.out', fmt = (v) => Math.round(v) }) {
    const o = { v: from };
    el.textContent = fmt(from);
    tl.to(
      o,
      {
        v: to,
        duration,
        ease,
        onUpdate: () => {
          el.textContent = fmt(o.v);
        },
      },
      start,
    );
  },

  // Replay a recorded pointer log (tools/record.mjs) as a cursor over the recording.
  //   offset: scene time where the recording's `mediaStart` second plays
  //   s: display px per capture CSS px; the cursor lives inside the same .k-cam as the video
  //   from/until: scene-time window to replay (a clip that starts mid-recording passes from)
  cursor(tl, { cursor, ripple, log, offset, mediaStart = 0, s, from = -Infinity, until = Infinity, sound }) {
    const at = (t) => offset + (t - mediaStart);
    const events = log.filter((e) => e.type !== 'mark' && e.type !== 'scroll');
    const first = events.find((e) => e.type === 'move');
    if (!first) return;
    // Where the pointer rests when the window opens: the end of the last move already done.
    const start = Math.max(0, at(0), from);
    let pos = { x: first.x0, y: first.y0 };
    for (const e of events) if (e.type === 'move' && at(e.t) + e.ms / 1000 <= start) pos = { x: e.x, y: e.y };
    tl.set(cursor, { x: pos.x * s, y: pos.y * s, scale: 1, opacity: 1 }, start);
    events.forEach((e, i) => {
      const T = at(e.t);
      if (T < from || T < 0 || T > until) return;
      const next = events[i + 1];
      if (e.type === 'move') {
        const nominal = e.ms / 1000;
        const real = next ? next.t - e.t : nominal;
        const d = real < nominal * 2.5 ? real : nominal * 1.15;
        tl.to(cursor, { x: e.x * s, y: e.y * s, duration: Math.max(0.12, d), ease: e.down ? 'none' : 'power2.inOut' }, T);
      } else if (e.type === 'click') {
        tl.to(cursor, { scale: 0.84, duration: 0.08, ease: 'power2.out' }, T - 0.02);
        tl.to(cursor, { scale: 1, duration: 0.22, ease: 'back.out(3)' }, T + 0.08);
        if (ripple) {
          tl.set(ripple, { x: e.x * s, y: e.y * s }, T);
          tl.fromTo(ripple, { scale: 0.35, opacity: 0.95 }, { scale: 1.5, opacity: 0, duration: 0.55, ease: 'power2.out' }, T);
        }
        if (sound) sound('click', T);
      } else if (e.type === 'down') {
        tl.to(cursor, { scale: 0.86, duration: 0.1, ease: 'power2.out' }, T);
        if (sound) sound('click', T);
      } else if (e.type === 'up') {
        tl.to(cursor, { scale: 1, duration: 0.25, ease: 'back.out(3)' }, T);
      }
    });
  },

  // The shared handoff: scenes arrive from the right and leave to the left, a short travel with
  // blur, so the film reads as one horizontal move through sections.
  enter(tl, el, at = 0, { x = 220, duration = 0.7 } = {}) {
    tl.fromTo(
      el,
      { x, opacity: 0, filter: 'blur(16px)' },
      { x: 0, opacity: 1, filter: 'blur(0px)', duration, ease: 'expo.out' },
      at,
    );
  },
  exit(tl, el, at, { x = -220, duration = 0.5 } = {}) {
    tl.to(el, { x, opacity: 0, filter: 'blur(16px)', duration, ease: 'power3.in' }, at);
  },

  // Slow ambient motion for decoratives: a finite yoyo that fills `total` seconds.
  drift(tl, el, { x = 0, y = 0, scale = 1, rotation = 0, period = 6, total, at = 0 }) {
    const repeat = Math.max(0, Math.floor(total / period) - 1);
    tl.to(el, { x, y, scale, rotation, duration: period, ease: 'sine.inOut', yoyo: true, repeat }, at);
  },

  // The brand mark: the paper plane from apps/web/components/brand.tsx.
  plane(size = 60, stroke = '#FFFFFF') {
    const h = Math.round((size * 80) / 104);
    return `<svg class="k-plane" width="${size}" height="${h}" viewBox="0 0 104 80" aria-hidden="true"><polygon points="4,36 98,4 56,76" fill="#FF4F00"/><polyline points="98,4 44,46 56,76" fill="none" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/></svg>`;
  },

  cursorSvg: `<svg viewBox="0 0 28 34" width="34" height="40" aria-hidden="true"><path d="M3 2 L3 27 L9.5 21 L13.6 31 L18 29.2 L13.9 19.5 L22.5 19.5 Z" fill="#201515" stroke="#fffdf9" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
};
