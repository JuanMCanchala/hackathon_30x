// Full-page stills of the real OndAI UI at 2x, plus the page-space boxes of the headings and of
// the elements the composition points at, so pans and highlights land on real UI.
//
//   node stills.mjs <outDir> [name ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, settle, BASE } from './browser.mjs';

const out = process.argv[2] ?? '../assets/stills';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });

const PROD = 'https://ondai.vercel.app';
const pages = {
  landing: { url: BASE + '/', maxHeight: 4200, texts: ['Cuando por fin lo encuentras,', 'Tu AI trend analyst'] },
  radar: {
    url: BASE + '/radar',
    texts: ['Temas con señal', 'Ventana abierta en ES', 'La onda', 'Ventana abierta en español', 'Los temas que más crecen'],
  },
  tema: {
    url: BASE + '/tema/t_720b9dcf',
    texts: ['Por qué crece', 'Encaje con 30X', 'La onda por idioma', 'Curva semanal · 8 semanas', 'Ya funcionó en inglés y portugués', 'La evidencia'],
  },
  contar: { url: BASE + '/tema/t_addbb60d/contar', texts: ['Elige el gancho', 'Vista previa · LinkedIn', 'Qué evitar', 'Nada se publica solo. Una persona aprueba cada pieza.'] },
  // Read only on the deployed demo: the week the team already planned.
  calendario: { url: PROD + '/calendario', texts: ['Lo que el equipo aprobó', 'Borradores esperando aprobación'] },
  evaluacion: {
    url: BASE + '/evaluacion',
    texts: ['¿Lo habría visto venir?', 'Onda por onda', '¿Cuánto tarda en llegar al español?', 'Temas de control'],
  },
  // Read only on the deployed demo: its followed topic «IA en empresas» and its last search.
  vigia: { url: PROD + '/vigia', texts: ['Sigue un tema', 'Atrapadas · las mejores primero', 'La última búsqueda', 'Encontradas', 'Atrapadas'] },
};

const { browser, page } = await launch();
const index = {};
for (const [name, cfg] of Object.entries(pages)) {
  if (only.length && !only.includes(name)) continue;
  await page.goto(cfg.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 30000 });
  // Lazy content renders on scroll: walk the page once, then come back to the top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await settle(page, 2500);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const h = Math.min(height, cfg.maxHeight ?? height);
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: 1440, height: h }, captureBeyondViewport: true });
  const boxes = await page.evaluate((texts) => {
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y + window.scrollY), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const found = {};
    for (const t of texts) {
      const all = [...document.querySelectorAll('body *')].filter(
        (e) => e.textContent.trim() === t && e.getBoundingClientRect().width > 0,
      );
      // The innermost element that carries the whole text.
      const el = all.find((e) => ![...e.children].some((c) => c.textContent.trim() === t)) ?? all[0];
      if (el) found[t] = r(el);
    }
    return found;
  }, cfg.texts);
  index[name] = { url: cfg.url, width: 1440, height: h, scale: 2, boxes };
  console.log(name, h, Object.keys(boxes).length + '/' + cfg.texts.length);
}
writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 2));
await browser.close();
