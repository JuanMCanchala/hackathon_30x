# Radar 30X: pendientes de entrega y JEV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar lo que puede descalificar a Radar 30X (repo sin datos de demo, sin despliegue, README incompleto) y subir innovación conectando JEV donde el código ya lo prevé.

**Architecture:** JEV entra como juez opcional del embudo de Vigía. `watch.ts` le pregunta a JEV por las piezas que pasaron idioma y fecha, y `screen()` (puro) recibe esos veredictos ya calculados en `ScreenOptions.judged`. Sin llave, o si JEV falla, todo sigue igual que hoy con las reglas de palabras clave. Lo demás son cambios de entrega: datos de demo versionados, despliegue y README.

**Tech Stack:** pnpm monorepo, TypeScript, Hono + PGlite (`apps/api`), Next.js 16 (`apps/web`), Vitest, `@typesafe-ai/sdk@0.7.0`.

**Spec:** El PDF `Reto 30X - Radar de contenido.pdf` (en la raíz de `30x/`), la rúbrica de `30x/contexto-hackathon.md` y la revisión del 2026-10-17 (en la conversación con Nicolás).

**Rama:** `feat/radar-jev`, que sale de `feat/radar` en `ccb8ac0`. Juan sigue en `feat/radar`, así que hay que hacer rebase antes de cada push.

## Global Constraints

- Entrega: domingo 2026-10-18, 12:00 PM hora Colombia, en HackRadar. Sin extensiones.
- Ningún secreto en el repo. Las llaves se leen del entorno (`wallenv run -- …`). `TYPESAFE_API_KEY` ya está en wallenv.
- El demo desplegado tiene que coincidir con el repo. Si no, es descalificación.
- `pnpm test` corre sin red. JEV se prueba con un `fetch` inyectado, igual que en `30x-mano-alzada/packages/server/test/jev.test.ts`.
- Todo el texto que ve el usuario va en español. Los comentarios de código van en inglés, como el resto del repo.
- `screen()` sigue siendo puro: la misma entrada da la misma salida, sin llamadas de red.
- CI (`.github/workflows/ci.yml`) tiene que pasar: format, lint, typecheck, test, eval y build.
- No tocar archivos que Juan esté editando sin avisarle. Lo de web, `sources` y `watch.ts` se coordina antes de hacer push.

## Review Focus

1. **JEV caído o sin llave a mitad de una búsqueda:** Vigía debe seguir con palabras clave y decirlo en `reasons`, sin tirar el run. Test en la Tarea 3.
2. **Pieza que JEV no evaluó** (fuera del prefiltro o con error parcial): `screen` usa la regla de palabras clave para esa pieza. Test en la Tarea 2.
3. **Llave expuesta en un error:** el mensaje de `JevUnavailableError` nunca contiene la llave. Test en la Tarea 1, copiado del patrón de Mano Alzada.
4. **Clon limpio del repo:** `DEMO_MODE=true LLM_MODE=replay pnpm dev` debe mostrar la semana congelada sin ninguna llave. Verificación en la Tarea 5.
5. **Búsqueda con muchas piezas** (623 candidatas): JEV solo se llama sobre las que pasan idioma y fecha, con un tope de 120 y concurrencia de 8. Test en la Tarea 3.

---

### Task 1: Cliente de JEV en la API

**Files:**

- Create: `apps/api/src/jev/client.ts`
- Modify: `apps/api/package.json` (agregar `"@typesafe-ai/sdk": "0.7.0"`), `apps/api/src/config.ts` (agregar `TYPESAFE_API_KEY: z.string().min(1).optional()`), `env.example` (agregar `TYPESAFE_API_KEY=` con un comentario)
- Test: `apps/api/test/jev.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface PieceVerdict {
    onTopic: number;
    fit: number;
  } // onTopic 0..1, fit 1..10
  export interface PieceJudge {
    judge(
      topic: string,
      pieces: { key: string; platform: string; lang: string; text: string; author: string }[],
    ): Promise<{ verdicts: Map<string, PieceVerdict>; inputTokens: number; ms: number }>;
  }
  export class JevUnavailableError extends Error {}
  export function createJevJudge(cfg: {
    apiKey: string;
    fetch?: typeof fetch;
    concurrency?: number;
  }): PieceJudge;
  ```
- Hace una llamada `systemOne` por pieza, con `model: 'jev-1.13.0'`, concurrencia 8 y un presupuesto de 15 s por llamada. Si una pieza falla, se omite del `Map`. Solo lanza `JevUnavailableError` si fallan todas.
- `state`: `{ topic, piece: { platform, lang, text, author } }`. Preguntas:
  - `on_topic`: `{ type: 'noul', instructions: 'Is the main subject of `piece.text`the topic in`topic`? A passing mention, a link or the author name is not enough.' }`. `onTopic` = `answers.on_topic.noul`.
  - `audience_fit`: `{ type: 'score', instructions: 'How useful is this piece for founders, executives and sales or growth teams in Latin America learning to apply AI in their business?', criteria: ['Irrelevant or purely technical (kernels, benchmarks)', 'Tangential', 'Somewhat useful', 'Useful for business decisions', 'A CEO needs to know this tomorrow'] }`. `fit` = `Math.round(1 + (answers.audience_fit.score / 4) * 9)` si `score` viene en el rango 0..4. Hay que verificar el rango real en la Tarea 1, paso 5.

- [ ] **Step 1: Write the failing tests** in `apps/api/test/jev.test.ts`:
  - `judges each piece and maps the answers`: un `fetch` falso responde `{ model:'jev-1.13.0', answers:{ on_topic:{type:'noul',noul:0.91}, audience_fit:{type:'score',score:3,legend:{},probabilities:{},confidence:0.8} }, usage:{input_tokens:120,output_tokens:0} }`. Se espera `verdicts.get('yt:1')` igual a `{ onTopic: 0.91, fit: 8 }` e `inputTokens === 120`.
  - `skips a piece whose call fails and keeps the rest`: la primera llamada da 500 y la segunda 200. El `Map` tiene una sola entrada.
  - `throws JevUnavailableError without the key when every call fails`: el `fetch` falso devuelve 401 con la llave en el body. `expect(error.message).not.toContain(apiKey)`.
- [ ] **Step 2: Run** `pnpm vitest run apps/api/test/jev.test.ts`. Expected: FAIL, porque `createJevJudge` no existe.
- [ ] **Step 3: Implement** `createJevJudge` en `apps/api/src/jev/client.ts`. Copiar de `30x-mano-alzada/packages/server/src/jev/live.ts` el manejo de errores sin llave (`unavailable`) y el uso de `TypeSafeClient`. Usar solo el backend `typesafe`.
- [ ] **Step 4: Run** `pnpm install && pnpm vitest run apps/api/test/jev.test.ts`. Expected: PASS.
- [ ] **Step 5: Probe the live API once** con `wallenv run -- node -e "<llamada con 2 piezas reales>"`. Confirmar el rango de `score` y la latencia. Si `score` no viene en 0..4, corregir el mapeo y el test.
- [ ] **Step 6: Commit** `feat(api): add a JEV judge for pieces`.

### Task 2: `screen()` usa los veredictos de JEV

**Files:**

- Modify: `packages/core/src/screen.ts` (`ScreenOptions`, la regla `tema` y el `score`)
- Test: `packages/core/test/screen.test.ts`

**Interfaces:**

- Consumes: `PieceVerdict` (redefinido en core como `ScreenVerdict { onTopic: number; fit: number }`, para que core no dependa de `apps/api`).
- Produces: `ScreenOptions.judged?: ReadonlyMap<string, ScreenVerdict>`, `export const JEV_ON_TOPIC = 0.5` y `ScreenDecision.fit: number | null`.

- [ ] **Step 1: Write the failing tests:**
  - `uses JEV for the topic when it judged the piece`: una pieza que no menciona ningún término, con `judged` en `{onTopic:0.82, fit:8}`, pasa `tema`. `reasons` contiene `'JEV: es del tema (82 %).'` y `fit === 8`.
  - `JEV can reject a piece the keywords would pass`: menciona el término, pero `onTopic` es 0.2. `failed === 'tema'` y la razón es `'JEV: solo lo menciona de paso (20 %).'`.
  - `falls back to keywords for pieces JEV did not judge`: no está en `judged`, así que se comporta igual que hoy.
  - `ranks better fit first among caught`: dos piezas iguales con fit 9 y 3. La de fit 9 queda primero en `caught`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/screen.test.ts`. Expected: los 4 tests nuevos FAIL.
- [ ] **Step 3: Implement.** En la regla `tema`: si `opts.judged?.get(c.key)` existe, decide por `onTopic >= JEV_ON_TOPIC`. Si no existe, usa `mentions()` como hoy. En la regla `viral`, sumar `(fit - 5) / 10` al `score` cuando haya `fit`. Si hay `fit`, agregar la razón `` `Encaje con 30X: ${fit}/10 (JEV).` ``.
- [ ] **Step 4: Run** `pnpm vitest run packages/core && pnpm eval`. Expected: PASS, y el backtest sin cambios porque no usa `screen`.
- [ ] **Step 5: Commit** `feat(core): let JEV decide topic and fit in the screen`.

### Task 3: Vigía llama a JEV antes del embudo

**Files:**

- Modify: `apps/api/src/services/watch.ts` (en `runWatch`, antes de la llamada a `screen` en la línea ~538), `apps/api/src/container.ts` (construir `deps.jev: PieceJudge | null` desde `config.TYPESAFE_API_KEY`) y el tipo `Deps`
- Test: `apps/api/test/watch.test.ts`

**Interfaces:**

- Consumes: `PieceJudge` (Tarea 1) y `ScreenOptions.judged` (Tarea 2).
- Produces: el `report` del run guarda `jev: { judged: number; inputTokens: number; ms: number; costUsd: number } | { skipped: string }`, con `costUsd = inputTokens * 0.042 / 1e6`.

- [ ] **Step 1: Write the failing tests** en `watch.test.ts`, con un `deps.jev` falso:
  - `asks JEV only for pieces that passed language and date, at most 120`: con 200 candidatas válidas, el juez recibe 120.
  - `keeps running on keywords when JEV is unavailable`: el juez lanza `JevUnavailableError`, el run termina, `report.jev.skipped` contiene el motivo y `caught` es igual al resultado sin JEV.
  - `without a key the run never calls JEV`: con `deps.jev = null`, `report.jev.skipped === 'sin llave'`.
- [ ] **Step 2: Run** `pnpm vitest run apps/api/test/watch.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Prefiltrar con las mismas condiciones que `screen` para idioma, fecha conocida y ventana. Ordenar por `engagement` descendente y tomar 120. Llamar a `deps.jev.judge(term, …)` dentro de un try. Pasar `judged` a `screen` y guardar `report.jev`.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Live check.** Correr `wallenv run -- pnpm dev`, crear un Vigía con "negocios" y verificar que las razones muestran «JEV: …» y que el costo de JEV aparece en el reporte.
- [ ] **Step 6: Commit** `feat(api): screen followed topics with JEV before any model reads them`.

### Task 4: README listo para el jurado

**Files:**

- Modify: `README.md`, en las secciones «Cuánto cuesta» y «Límites» y en dos secciones nuevas.

- [ ] **Step 1: «Cuánto cuesta al mes»** como tabla con supuestos explícitos: Fireworks (DeepSeek V4.1 Flash + qwen3 embeddings) con el costo real de una semana leído de `/evaluacion`, multiplicado por 4,3; JEV (piezas por búsqueda × búsquedas al día × 30 × tokens × USD 0,042/M); hosting (API + web); y treg.to opcional. Cerrar con el total en USD por mes frente a los USD 19.000–50.000 al año de las suites.
- [ ] **Step 2: Sección «Seguridad»:**
  - Solo contenido público, sin iniciar sesión en ninguna red.
  - No se guardan correos, teléfonos ni perfiles privados.
  - Secretos solo por entorno (`env.example`, ningún `.env` versionado).
  - Errores de JEV y del modelo sin llaves.
  - Nada se publica solo: una persona aprueba.
  - Datos personales según la Ley 1581: solo el nombre público del autor.
- [ ] **Step 3: Sección «JEV en el embudo»:** qué dos preguntas se le hacen a JEV, por qué JEV y no un LLM (milisegundos, USD 0,042/M, decisiones cerradas), el costo medido en la Tarea 3 y el fallback a palabras clave. Actualizar el límite de «Vigía decide por palabras clave».
- [ ] **Step 4: «Demo»:** la URL desplegada de la Tarea 5 y el usuario o flujo para probarla.
- [ ] **Step 5: Run** `pnpm format:check`. Expected: PASS.
- [ ] **Step 6: Commit** `docs: monthly cost, security and JEV in the README`.

### Task 5: Datos de demo en el repo y despliegue (coordinar con Juan)

**Files:**

- Modify: `.gitignore` (dejar ignorados solo `data/raw/`, `data/capture.log` y `data/llm-cache/enrich*/`, como hoy)
- Add: `data/snapshot/**` y `data/llm-cache/**` (lo que no esté ignorado), generados por Juan con `POST /api/v1/snapshot`

- [ ] **Step 1: Pedirle a Juan** que exporte la semana congelada (`POST /api/v1/snapshot`) y haga commit de `data/snapshot` y `data/llm-cache` sin `enrich*`. Hoy `data/` no existe en el repo y el modo sin llave no funciona en un clon limpio.
- [ ] **Step 2: Verificar en un clon limpio:** `git clone … /tmp/radar && cd /tmp/radar && pnpm install && DEMO_MODE=true LLM_MODE=replay pnpm dev`. Expected: `/` muestra los 10 temas sin ninguna llave.
- [ ] **Step 3: Desplegar la API** (Hono + PGlite necesita disco) en Railway o Render con `DEMO_MODE=true`, `LLM_MODE=auto` y las llaves `FIREWORKS_API_KEY` y `TYPESAFE_API_KEY` cargadas en el panel. Desplegar la web en Vercel con `API_URL` apuntando a la API.
- [ ] **Step 4: Smoke test** contra producción: abrir `/`, `/tema/<id>`, `/evaluacion` y `/vigia`, y lanzar un Vigía con "negocios". Expected: todo responde y Vigía muestra razones de JEV.
- [ ] **Step 5: Commit** de la URL en el README (Tarea 4, paso 4) y push.

### Task 6: Demo de 3 minutos y video de respaldo

- [ ] **Step 1: Guion** en `docs/pitch.md`:
  - 0:00 – 0:20: el problema (miles de USD en scraping sin el porqué).
  - 0:20 – 1:00: `/evaluacion`, 18 de 18 olas con 10,5 días de anticipación.
  - 1:00 – 1:50: la ola por idioma y un tema con «ventana abierta en español».
  - 1:50 – 2:35: Vigía en vivo con el embudo y las razones de JEV, más «Cómo lo contamos».
  - 2:35 – 3:00: costo mensual y propuesta de piloto.
- [ ] **Step 2: Grabar el video de respaldo** del demo desplegado (Cap o Loom) antes del domingo a las 10:00.
- [ ] **Step 3: Subir a HackRadar** antes del domingo a las 11:30: video, URL, repo y README.

---

**Fuera de alcance:**

- Pasar el `fit` por tema de `explain.ts` a JEV: necesita texto de razones, que JEV no genera.
- Cambios visuales en `/vigia`: las razones de JEV ya llegan como texto en `reasons`.
- Calibrar el encaje contra los 6 carruseles del PDF: queda solo si sobra tiempo después de la Tarea 6.
