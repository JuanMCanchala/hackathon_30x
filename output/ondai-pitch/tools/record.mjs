// Record real interactions with the local OndAI demo (DEMO_MODE=true, frozen week) as WebM
// screencasts, and log every pointer move and click with its time from the start of the
// recording, so the composition can draw a cursor on the real element at the real moment.
//
//   node record.mjs <outDir> [take ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, settle, wait, BASE, VIEWPORT } from './browser.mjs';

const out = process.argv[2] ?? '../assets/capture';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });

// Smooth pointer path with an ease-in-out, logged for the overlay cursor.
function makeRig(page, log, t0) {
  let pos = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  const now = () => (performance.now() - t0()) / 1000;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  return {
    async move(x, y, ms = 700, { down = false } = {}) {
      const from = { ...pos };
      // Dragging re-renders the deck on every step, so a drag takes fewer, larger steps.
      const steps = down ? 10 : Math.max(8, Math.round(ms / 16));
      log.push({ t: now(), type: 'move', x0: from.x, y0: from.y, x, y, ms, down });
      for (let i = 1; i <= steps; i++) {
        const k = ease(i / steps);
        await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
        await wait(ms / steps);
      }
      pos = { x, y };
    },
    async click(x, y, ms = 700) {
      await this.move(x, y, ms);
      log.push({ t: now(), type: 'click', x, y });
      await page.mouse.click(x, y);
    },
    async drag(x, y, dx, dy, ms = 650) {
      await this.move(x, y, 600);
      log.push({ t: now(), type: 'down', x, y });
      await page.mouse.down();
      await this.move(x + dx, y + dy, ms, { down: true });
      log.push({ t: now(), type: 'up', x: x + dx, y: y + dy });
      await page.mouse.up();
    },
    async scroll(dy, ms = 1200) {
      log.push({ t: now(), type: 'scroll', dy, ms });
      const steps = Math.round(ms / 16);
      let done = 0;
      for (let i = 1; i <= steps; i++) {
        const target = Math.round(dy * ease(i / steps));
        await page.evaluate((d) => window.scrollBy(0, d), target - done);
        done = target;
        await wait(ms / steps);
      }
    },
    mark(name) {
      log.push({ t: now(), type: 'mark', name });
    },
    now,
  };
}

async function box(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 20000 });
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}

async function byText(page, text, tag = '*') {
  const handle = await page.waitForFunction(
    (t, tag) =>
      [...document.querySelectorAll(tag)].find(
        (e) => e.textContent.trim() === t && e.getBoundingClientRect().width > 0,
      ),
    { timeout: 20000 },
    text,
    tag,
  );
  const b = await handle.asElement().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}

// Scrolling a heavy page while screencasting at 2x drops frames, so takes only record
// interactions; long pans are done in the composition over full-page stills (stills.mjs).
const takes = {
  // The landing hero: its rotating word («Tu equipo de media…») plays on its own.
  async landing(page, rig) {
    await wait(800);
    await rig.move(980, 380, 1200);
    await wait(5200);
  },
  // The Radar at «La onda»: the life-cycle curve, then the «Por idioma» tab.
  async radar(page, rig) {
    await wait(1500);
    await rig.move(900, 520, 900);
    await wait(1500);
    const tab = await byText(page, 'Por idioma');
    await rig.click(tab.x, tab.y, 900);
    rig.mark('por-idioma');
    await wait(3200);
  },
  // Elegir: the real deck. Drag the front card right («Sirve»), then the next one left.
  async elegir(page, rig) {
    await wait(1500);
    const card = await box(page, '[aria-label="Sirve (flecha derecha)"]');
    // The front card sits above the buttons; grab it a third of the way down.
    const grab = { x: card.x - 40, y: 480 };
    rig.mark('right-start');
    await rig.drag(grab.x, grab.y, 420, -20, 700);
    rig.mark('right-done');
    await wait(2600);
    rig.mark('left-start');
    await rig.drag(grab.x, grab.y, -440, 10, 700);
    rig.mark('left-done');
    await wait(2400);
  },
  // How 30X tells it: angle and the hook the team chose for «Shadow AI», then the real
  // approval: «Aprobar al calendario», pick a day and an hour, «Programar».
  async contar(page, rig) {
    await wait(1200);
    await rig.move(1000, 250, 900);
    rig.mark('angulo');
    await wait(1400);
    const hook = await byText(page, '12 creadores esta semana y +247%: el Shadow AI ya es tendencia en LatAm.');
    await rig.move(hook.x, hook.y, 800);
    rig.mark('gancho');
    await wait(1600);
    const approve = await byText(page, 'Aprobar al calendario', 'button');
    await rig.click(approve.x, approve.y, 900);
    rig.mark('dialog');
    await wait(1400);
    const days = await page.$$('form fieldset:first-of-type button[aria-pressed]');
    const day = await days[2].boundingBox();
    await rig.click(day.x + day.width / 2, day.y + day.height / 2, 800);
    await wait(700);
    const hours = await page.$$('form fieldset:nth-of-type(2) button[aria-pressed]');
    const hour = await hours[1].boundingBox();
    await rig.click(hour.x + hour.width / 2, hour.y + hour.height / 2, 700);
    await wait(800);
    const submit = await box(page, 'form button[type="submit"]');
    await rig.click(submit.x, submit.y, 800);
    rig.mark('programado');
    await wait(2600);
  },
};

// Where each take starts: a route and, optionally, a heading scrolled to the top first.
const routes = {
  landing: '/',
  radar: '/radar',
  elegir: '/elegir',
  contar: '/tema/t_addbb60d/contar',
};
const scrollTo = { radar: 'La onda' };

const { browser, page } = await launch();
for (const [name, take] of Object.entries(takes)) {
  if (only.length && !only.includes(name)) continue;
  const url = (process.env[`URL_${name.toUpperCase()}`] ?? BASE) + routes[name];
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 30000 });
  await settle(page, 2500);
  if (scrollTo[name]) {
    await page.evaluate((t) => {
      const h = [...document.querySelectorAll('h1,h2,h3')].find((e) => e.textContent.trim() === t);
      window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 140);
    }, scrollTo[name]);
    await settle(page, 1500);
  }
  await page.screenshot({ path: `${out}/${name}-start.png` });
  const log = [];
  let start = 0;
  const rig = makeRig(page, log, () => start);
  const recorder = await page.screencast({ path: `${out}/${name}.webm`, fps: 30, scale: 2 });
  start = performance.now();
  await take(page, rig);
  const duration = rig.now();
  await recorder.stop();
  await page.screenshot({ path: `${out}/${name}-end.png` });
  writeFileSync(`${out}/${name}.json`, JSON.stringify({ url, viewport: VIEWPORT, duration, log }, null, 2));
  console.log(name, duration.toFixed(2), 's');
}
await browser.close();
