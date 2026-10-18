# API de Radar 30X: contrato HTTP

Este documento es el contrato de la API de `apps/api` para el front. Sale del código (`apps/api/src/http/**` y `apps/api/src/services/*.ts`) y se verificó contra la semana demo real. Si este archivo y el código no coinciden, manda el código y hay que corregir este archivo.

## Convenciones

- Base: `/api/v1`. Todo es JSON (`content-type: application/json`), salvo `GET /events` (SSE) y `GET /media/:item/:n` (imagen JPEG).
- CORS: solo se acepta el origen de `PUBLIC_WEB_URL`. El navegador llama a la API a través del proxy de la web.
- Fechas: todos los instantes son strings ISO 8601 con `T` y zona (`2026-10-18T00:11:57.139Z`). `scheduledFor`, las etiquetas `week` y los `date` de `history` son fechas `YYYY-MM-DD`.
- Los cuerpos `POST` tienen que ser JSON válido. Las rutas que aceptan cuerpo vacío lo dicen en la tabla.
- Error, siempre con esta forma:

```ts
{ error: { code: string; message: string /* en español, se puede mostrar */; issues?: { path: string; message: string }[] } }
```

| `code`             | HTTP | Cuándo                                                                         |
| ------------------ | ---- | ------------------------------------------------------------------------------ |
| `validation_error` | 400  | Query o cuerpo no pasan el esquema zod; trae `issues` (`path` tipo `platform`) |
| `unauthorized`     | 401  | Ruta de admin sin token o con token incorrecto                                 |
| `forbidden`        | 403  | Ruta de admin en la demo (`DEMO_MODE`) sin `ADMIN_TOKEN` configurado           |
| `not_found`        | 404  | El recurso no existe (tema, adaptación, vigía, pieza, imagen)                  |
| `conflict`         | 409  | Ya hay 5 vigías activas                                                        |
| `rate_limited`     | 429  | Se pasó el límite por visitante (ver abajo)                                    |
| `loading`          | 503  | La API todavía está cargando la semana demo al arrancar                        |
| `bad_request`      | 400  | El cuerpo no es JSON válido                                                    |
| `internal_error`   | 500  | Cualquier otro fallo                                                           |

Algunos servicios usan otros códigos puntuales: `bad_url` y `unsupported_url` (400) y `unreadable` (422) en `POST /sensor`, y `bad_question` (400) en `POST /ask`. Lo correcto es mostrar `message` y no ramificar por `code` salvo para `loading` y `rate_limited`.

## Autenticación, límites y arranque

**Admin.** Estas rutas piden `Authorization: Bearer <ADMIN_TOKEN>`: `POST /pipeline/run`, `POST /snapshot`, `DELETE /calendar/:id` y `DELETE /watches/:id` cuando el tema viene con la semana demo (se siguió antes de cargar el snapshot). Los temas que sigue un visitante se pueden dejar de seguir sin token (con el límite por visitante). Responden 401 `unauthorized` sin token o con uno incorrecto, y 403 `forbidden` cuando no hay `ADMIN_TOKEN` configurado y `DEMO_MODE` está activo. Sin token configurado y fuera de la demo quedan abiertas.

**Límite por visitante.** Las rutas que llaman a un modelo pago comparten un presupuesto de **20 solicitudes por hora por IP** (ventana deslizante; la IP sale del primer `x-forwarded-for`). Además hay un tope de **300 por hora para todos los visitantes juntos**, porque la IP de `x-forwarded-for` se puede falsificar llamando a la API sin pasar por el proxy. Pasado cualquiera de los dos límites responden 429 `rate_limited`. Son: `POST /ask`, `GET /topics/:id?refresh=1`, `POST /topics/:id/adaptations`, `POST /sensor`, `POST /watches`, `POST /watches/:id/run`, `POST /watches/:id/hits/:item/adapt` y `DELETE /watches/:id` de un tema de visitante. `POST /calendar` no tiene límite ni token.

**Vigía.** Hay como máximo 5 vigías activas. La sexta responde 409 `conflict`.

**Arranque.** Mientras la API importa la semana demo (unos 30 a 40 s en frío), toda ruta bajo `/api/` responde 503 `loading`, salvo `GET /health`, que siempre responde `{ ok: true, loading: boolean }`. Lo correcto es consultar `/health` hasta que `loading` sea `false`.

## Rutas

Todas las rutas van bajo `/api/v1`. **Paid** = límite de 20/h. **Admin** = token.

| Método   | Ruta                            | Parámetros                                                                                                                                                                                                                                                                                                         | Respuesta                                                                            |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET`    | `/health`                       | —                                                                                                                                                                                                                                                                                                                  | `{ ok: true, loading: boolean }`                                                     |
| `GET`    | `/radar`                        | query: `platform` = `all` (default) \| `linkedin` \| `instagram` \| `youtube` \| `tiktok` \| `x` \| `bluesky`; `region` = `global` (default) \| `latam` (solo piezas en español); `untouched` = `1` \| `0` (default `0`: solo temas que 30X no tocó en 60 días); `audience` = `30x` (default, encaje ≥ 7) \| `all` | [`Radar`](#get-radar)                                                                |
| `GET`    | `/topics/:id`                   | query: `region` = `latam` (cualquier otro valor es `global`); `refresh` = `1` reescribe el «por qué» y el encaje con el modelo (**Paid**: cuenta contra el límite por visitante)                                                                                                                                   | [`TopicDetail`](#get-topicsid)                                                       |
| `GET`    | `/topics/:id/adaptations`       | —                                                                                                                                                                                                                                                                                                                  | [`Adaptation[]`](#adaptaciones), la más nueva primero                                |
| `POST`   | `/topics/:id/adaptations`       | **Paid**. Cuerpo (opcional): `variant` entero 0–5 (default 0); `refresh` boolean (default `false`: devuelve la guardada si existe)                                                                                                                                                                                 | [`Adaptation`](#adaptaciones)                                                        |
| `GET`    | `/calendar`                     | —                                                                                                                                                                                                                                                                                                                  | [`CalendarEntry[]`](#calendario), por `scheduledFor` y luego `approvedAt`            |
| `POST`   | `/calendar`                     | Cuerpo: `adaptationId` string (requerido); `format` = `linkedin` \| `carousel` \| `reel` \| `youtube`; `scheduledFor` `YYYY-MM-DD`; `approvedBy` string 1–80 (default `"Equipo de medios 30X"`)                                                                                                                    | `CalendarEntry` sin `topicName`                                                      |
| `DELETE` | `/calendar/:id`                 | **Admin**                                                                                                                                                                                                                                                                                                          | `{ ok: true }`                                                                       |
| `GET`    | `/sensor`                       | —                                                                                                                                                                                                                                                                                                                  | [`Submission[]`](#sensor) (últimas 50, una por URL)                                  |
| `POST`   | `/sensor`                       | **Paid**. Cuerpo: `url` string 8–500, `https` de LinkedIn, Instagram, TikTok, YouTube, X/Twitter o Bluesky; `submittedBy` string 1–80 (default `"Equipo 30X"`); `note` string ≤ 280 (opcional)                                                                                                                     | [`Added`](#sensor)                                                                   |
| `GET`    | `/references`                   | —                                                                                                                                                                                                                                                                                                                  | [`References`](#referentes)                                                          |
| `GET`    | `/evaluation`                   | —                                                                                                                                                                                                                                                                                                                  | [`Evaluation`](#evaluación)                                                          |
| `POST`   | `/ask`                          | **Paid**. Cuerpo: `question` string 3–500; `history` (opcional) hasta 6 `{ question ≤ 500, answer ≤ 4000 }`                                                                                                                                                                                                        | [`Answer`](#pregúntale-al-radar)                                                     |
| `GET`    | `/pipeline`                     | —                                                                                                                                                                                                                                                                                                                  | [`PipelineStatus`](#pipeline)                                                        |
| `POST`   | `/pipeline/run`                 | **Admin**. Cuerpo (opcional): `enrich` boolean (default `true`); `limit` entero 1–100000 (opcional, default interno 5000); `rebuild` boolean (default `false`); `force` boolean (default `false`)                                                                                                                  | **202** `PipelineStatus` (si ya corre, devuelve el estado actual)                    |
| `POST`   | `/snapshot`                     | **Admin**                                                                                                                                                                                                                                                                                                          | `Record<tabla, filas>`, p. ej. `{ "items": 41234, ... }`                             |
| `GET`    | `/watches`                      | —                                                                                                                                                                                                                                                                                                                  | [`WatchSummary[]`](#vigía), la más nueva primero                                     |
| `POST`   | `/watches`                      | **Paid**. Cuerpo: `term` string 2–60 (se recorta)                                                                                                                                                                                                                                                                  | **201** `{ id: string, term: string }`; la primera búsqueda arranca en segundo plano |
| `GET`    | `/watches/:id`                  | —                                                                                                                                                                                                                                                                                                                  | [`WatchDetail`](#vigía)                                                              |
| `POST`   | `/watches/:id/run`              | **Paid**. Sin cuerpo                                                                                                                                                                                                                                                                                               | `{ started: boolean }` (`false` si ya estaba buscando)                               |
| `DELETE` | `/watches/:id`                  | **Admin**. Borra la vigía                                                                                                                                                                                                                                                                                          | `{ ok: true }`                                                                       |
| `POST`   | `/watches/:id/hits/:item/adapt` | **Paid**. Cuerpo (opcional): `variant` entero 0–5 (default 0)                                                                                                                                                                                                                                                      | [`AdaptationContent`](#adaptaciones) (sin `id`, `topicId`, `variant` ni `createdAt`) |
| `GET`    | `/media/:item/:n`               | `n` entero 1–10 (lámina de un carrusel atrapado)                                                                                                                                                                                                                                                                   | `image/jpeg`, cache 1 día; 404 si no existe                                          |
| `GET`    | `/events`                       | —                                                                                                                                                                                                                                                                                                                  | Stream SSE, ver [Eventos](#eventos-sse)                                              |

`:item` es el id de una pieza (`plataforma:idExterno`, p. ej. `youtube:abc123`) y hay que codificarlo con `encodeURIComponent`.

## Formas de respuesta

Tipos compartidos:

```ts
type Stage = 'emergente' | 'crecimiento' | 'saturado' | 'declive' | 'estable';
type Platform =
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'bluesky'
  | 'hn'
  | 'github'
  | 'huggingface'
  | 'arxiv'
  | 'news'
  | 'newsletter'
  | 'producthunt';
type Lang = 'en' | 'pt' | 'es';
type Cost = { weekUsd: number; llmUsd: number; dataUsd: number }; // USD de los últimos 7 días
```

### GET /radar

```ts
interface Radar {
  week: { start: string; end: string }; // instantes ISO; la semana termina en la última captura
  headline: string; // una frase en español
  basis: {
    pieces: number; // piezas de la semana con tema
    creators: number; // creadores distintos (plataforma:autor)
    sources: number; // plataformas distintas
    updatedAt: string; // ISO, = week.end
  };
  topics: RadarTopic[]; // top 10 (o menos), rank 1..n
  forming: RadarTopic[]; // «Se está formando»: hasta 6, fuera del top, rank propio 1..n
  windowsOpen: RadarTopic[]; // ventana al español abierta: hasta 6, rank propio 1..n
  hiddenByAudience: number; // cuántos del top 10 sin filtrar deja fuera audience=30x (0 si audience=all)
  coverage: { platform: Platform; pieces: number; reason: string } | null;
  cost: Cost;
}
```

`coverage` explica por qué una sola red llena menos de 10 lugares. Solo **no es `null`** cuando `platform` es una red concreta (no `all`) **y** `topics.length < 10`. `pieces` cuenta las piezas de esa red esta semana que caen en algún tema. `reason` es la frase lista para mostrar y nombra la causa: el filtro de encaje con 30X (por ejemplo: «El filtro de encaje con 30X deja fuera 8 de los 10 temas de LinkedIn; con todas las audiencias aparecen.»), pocas piezas de esa red («Solo 37 piezas de X caen esta semana en temas del radar: alcanzan para 2 temas, no para 10.»), o ambas.

### RadarTopic (la vista de tema)

Sale de `topicView` en `services/radar.ts`. Se usa en `topics`, `forming`, `windowsOpen`, `references.gaps` y, extendida, en `GET /topics/:id`.

```ts
interface RadarTopic {
  id: string; // "t_fa1b0b2c"
  rank: number; // posición en su lista (1..n); 0 en /topics/:id si no está rankeado
  name: string;
  definition: string | null;
  stage: Stage;
  timing: string; // "Entra ya" | "Esta semana" | "Solo con ángulo propio" | "No entres" | "Observa"
  growthPct: number; // % de creadores vs. las 4 semanas previas (entero)
  lift: number;
  momentum: number;
  creators: number; // creadores distintos esta semana, en fuentes uniformes
  pieces: number;
  platforms: Platform[]; // redes donde aparece esta semana, de más a menos creadores
  sparkline: number[]; // creadores distintos por semana, de la más vieja a la actual (8 valores)
  fit: number | null; // encaje con la audiencia de 30X, 1–10; null si no se midió
  why: string | null; // una frase: por qué crece
  wavePos: number; // posición en la ola, 0–1 (ya repartida para que no se encimen)
  untouched: boolean; // ninguna pieza de 30X o Andrés Bilbao en 60 días
  forming: boolean; // sube en el carril técnico y aún no llega a LinkedIn/Instagram
  fresh: boolean; // nadie habló de él en las 4 semanas previas
  growingIn: Platform[]; // fuentes uniformes (bluesky, news, hn, github) donde crece solo
  confirmed: boolean; // growingIn.length >= 2; si no, «por confirmar»
  languages: Record<
    Lang,
    {
      lang: Lang;
      creators: number;
      growthPct: number;
      stage: Stage | 'ausente';
      wavePos: number | null; // null si 'ausente'
      sparkline: number[]; // mismo formato que sparkline
    }
  >;
  spanishWindow: {
    open: boolean; // viral en en/pt y casi nada en español
    leader: Lang | null; // 'en' | 'pt' | null
    lagDays: number | null; // múltiplo de 7
    reached: boolean; // si el español ya despegó (si no, el retraso sigue contando)
  };
}
```

**`sparkline` y `platforms` son arrays JSON, no strings separados por espacios.** El servidor devuelve `"sparkline": [4,3,3,1,4,4,2,22]` y `"platforms": ["news","bluesky"]`. Si algún wireframe o prototipo los trata como texto con espacios, la conversión es responsabilidad del front.

### GET /topics/:id

404 `not_found` si el tema no existe o no tiene piezas recientes.

```ts
interface TopicDetail {
  topic: RadarTopic & {
    rankScope: '30x' | 'all'; // rank entre los temas para la audiencia de 30X (default del radar) o entre todos
    queries: string[];
    wikipedia: string | null; // título del artículo en inglés
  };
  weekly: {
    // últimas 8 semanas, de la más vieja a la actual
    week: string; // YYYY-MM-DD
    creators: number; // creadores distintos en fuentes uniformes
    pieces: number; // piezas de todas las fuentes
    byLane: { mainstream: number; technical: number; media: number };
  }[];
  history: {
    // ~6 meses; solo las fuentes con datos (puede venir vacío)
    source: 'wikipedia' | 'hn' | 'bluesky';
    label: string; // "Visitas en Wikipedia (inglés), por día", ...
    points: { date: string /* YYYY-MM-DD */; value: number }[];
  }[];
  trigger: { date: string; title: string; url: string; source: string } | null; // la noticia que lo encendió
  why: {
    patterns: {
      // hasta 4 rasgos contados de las piezas que despegaron
      feature: string; // 'hookType' | 'format' | 'weekday' | 'hourBucket' | 'authorTier' | 'authorType' | 'emotion'
      value: string;
      label: string; // en palabras: "7 de 10 ... abren con una cifra"
      outliers: number;
      outlierTotal: number;
      rest: number;
      restTotal: number;
      lift: number;
    }[];
    narrative: string | null;
    cited: string[]; // ids de piezas
  };
  fit: {
    score: number;
    executive: number;
    noCode: number;
    latam: number; // 1–10
    pillar: 'Ventas' | 'Growth' | 'Inteligencia Artificial' | 'Next';
    hypeRisk: 'bajo' | 'medio' | 'alto';
    reasons: string[];
  } | null;
  evidence: Piece[]; // hasta 9, máximo 3 por red
  inspiration: (Piece & { lang: 'en' | 'pt'; es: string | null })[]; // hasta 4, idea en español
  coverage: { name: string /* "30X y Andrés Bilbao" */; pieces: Piece[] }[]; // [] o un elemento con hasta 6 piezas
}

interface Piece {
  id: string; // "plataforma:idExterno"
  platform: Platform;
  url: string;
  authorName: string;
  authorHandle: string | null;
  authorFollowers: number | null;
  publishedAt: string; // ISO
  title: string | null;
  text: string; // hasta 600 caracteres
  format: string; // 'post' | 'carousel' | 'reel' | 'short' | 'video' | 'article' | 'thread' | ...
  hookType: string | null;
  hook: string | null;
  emotion: string | null;
  audience: string | null;
  authorType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number;
  outlier: number | null; // engagement ÷ mediana de su autor; null sin historial
  reference: boolean; // es de un perfil de 30X
}
```

### Adaptaciones

```ts
interface AdaptationContent {
  angle: string;
  hooks: string[];
  linkedin: string; // con saltos de línea
  carousel: { title: string; body: string }[];
  reel: { hook: string; beats: string[]; onScreen: string[]; cta: string };
  youtube: { title: string; thumbnail: string };
  avoid: string[];
  inspiredBy?: string[]; // ids de piezas en/pt; falta en adaptaciones viejas
}
interface Adaptation extends AdaptationContent {
  id: string; // "adp_..."
  topicId: string;
  variant: number; // 0–5
  createdAt: string; // ISO
}
```

`POST /topics/:id/adaptations` devuelve `Adaptation`. `POST /watches/:id/hits/:item/adapt` devuelve solo `AdaptationContent` y la guarda en `hit.adaptation`.

### Calendario

```ts
interface CalendarEntry {
  id: string; // "cal_..."
  adaptationId: string;
  topicId: string;
  topicName: string; // solo en GET /calendar
  format: string; // en palabras: "Post de LinkedIn" | "Carrusel de Instagram" | "Reel o TikTok" | "Video de YouTube"
  title: string;
  body: string; // el texto a publicar, con saltos de línea
  scheduledFor: string; // YYYY-MM-DD
  approvedBy: string;
  approvedAt: string; // ISO
}
```

### Sensor

```ts
// GET /sensor
interface Submission {
  id: string; // "sns_..."
  url: string;
  submittedBy: string;
  note: string | null;
  status: 'added' | 'unreadable';
  createdAt: string; // ISO
  piece: {
    id: string;
    platform: Platform;
    authorName: string;
    title: string;
    likes: number | null;
    comments: number | null;
    views: number | null;
    hook: string | null;
  } | null; // null si no se pudo leer
  topics: { id: string; name: string }[];
}
// POST /sensor (si el post no se puede leer: 422 unreadable)
interface Added {
  id: string;
  itemId: string;
  platform: Platform;
  title: string;
  topics: { id: string; name: string }[];
}
```

### Referentes

```ts
interface References {
  profiles: {
    name: string;
    role: string;
    platform: Platform;
    url: string;
    followers: number | null;
    pieces: number;
    medianEngagement: number;
    best: {
      // hasta 5, por ratio
      id: string;
      url: string;
      platform: Platform;
      publishedAt: string;
      format: string;
      text: string; // hasta 280 caracteres
      hook: string | null;
      hookType: string | null;
      views: number | null;
      likes: number | null;
      comments: number | null;
      engagement: number;
      ratio: number | null; // engagement ÷ mediana del perfil
      topics: { id: string; name: string }[];
    }[];
    formats: { format: string; pieces: number; medianRatio: number }[];
  }[];
  gaps: RadarTopic[]; // hasta 6 temas para la audiencia de 30X que 30X no tocó
}
```

### Evaluación

```ts
interface Evaluation {
  asOf: string; // ISO
  languageLag: {
    topics: number;
    sameWeek: number;
    later: number;
    laterMedianDays: number | null;
    waiting: number;
    waitingMedianDays: number | null;
    stillOpen: number;
    examples: { name: string; leader: Lang; lagDays: number; open: boolean; reached: boolean }[]; // hasta 8
  };
  backtest: unknown | null; // packages/core/fixtures/backtest/report.json tal cual (summary, waves, controls, ...)
  corpus: {
    byPlatform: { platform: string; pieces: number; creators: number }[];
    read: number;
    ai: number;
    topics: number;
    captures: number;
  };
  cost: Cost;
}
```

`backtest` es el archivo del reporte sin transformar. Sus claves actuales son `seriesFetchedAt`, `rule`, `params`, `sources`, `waves`, `controls`, `summary`, `alternatives` y `passed`. Para la UI, la fuente útil es `summary`, con `detectionRate`, `medianLeadDays`, `falseAlarmRate` y demás.

### Pregúntale al radar

```ts
interface Answer {
  answer: string; // texto plano, puede traer líneas con guiones
  refs: {
    ref: string /* topic id */;
    label: string;
    href: string /* "/tema/<id>" */;
    external: false;
  }[]; // hasta 6
  followUps: string[]; // hasta 3
}
```

### Vigía

```ts
// GET /watches
interface WatchSummary {
  id: string;
  term: string;
  caught: number;
  lastRunAt: string | null;
  running: boolean;
}

// GET /watches/:id
interface WatchDetail {
  watch: {
    id: string;
    term: string;
    plan: Record<'en' | 'pt', { queries: string[]; match: string[] }>;
    langs: ('en' | 'pt')[];
    windowHours: number;
    everyMinutes: number;
    budget: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    running: boolean;
  };
  run: {
    // la última búsqueda terminada, o null
    startedAt: string;
    finishedAt: string | null;
    report: WatchReport | null;
    error: string | null;
  } | null;
  hits: {
    // hasta 80, los más nuevos primero
    piece: Piece; // outlier siempre null aquí
    lang: 'en' | 'pt';
    score: number;
    reasons: string[];
    foundAt: string;
    capture: {
      es: string | null;
      slides?: {
        n: number;
        image: string /* "/api/v1/media/<item>/<n>" */;
        text: string;
        es: string;
      }[];
      video?: { hook: string; points: string[]; transcriptChars: number } | null;
      idea?: string | null;
    } | null;
    adaptation: AdaptationContent | null;
  }[];
}

type WatchStep = 'encontradas' | 'idioma' | 'tema' | 'reciente' | 'viral' | 'nuevo' | 'presupuesto';
interface WatchReport {
  steps: { step: WatchStep; left: number }[];
  sources: {
    source: string;
    lang: 'en' | 'pt' | null;
    region?: string;
    query: string;
    status: number;
    found: number;
  }[];
  rejected: {
    rule: Exclude<WatchStep, 'encontradas'>;
    count: number;
    examples: { title: string; reason: string }[];
  }[];
  caught: number;
  costUsd: number;
  tokens: { input: number; output: number };
  jev?: { judged: number; inputTokens: number; ms: number; costUsd: number } | { skipped: string };
}
```

### Pipeline

```ts
interface PipelineStatus {
  running: boolean;
  step: 'ingesta' | 'lectura' | 'temas' | 'nombres' | 'explicaciones' | null;
  progress: { done: number; total: number } | null; // se llena en 'lectura'; vuelve a null al terminar
  startedAt: string | null;
  finishedAt: string | null;
  last: Record<string, unknown> | null; // estadísticas del último run terminado
  error: string | null;
}
```

### Eventos (SSE)

`GET /api/v1/events` mantiene un stream abierto. Cada 25 s manda un `event: ping` con `data` vacío. Los eventos del dominio llegan **sin nombre de evento** (en el navegador entran por `onmessage`) y en `data` traen un JSON:

```ts
interface DomainEvent {
  type:
    | 'pipeline.progress'
    | 'pipeline.done'
    | 'sensor.received'
    | 'calendar.changed'
    | 'watch.changed';
  at: string; // ISO
  data: Record<string, unknown>;
}
```

| `type`              | `data`                                                 | Qué refrescar         |
| ------------------- | ------------------------------------------------------ | --------------------- |
| `pipeline.progress` | `{ step, done?, total? }`                              | `GET /pipeline`       |
| `pipeline.done`     | estadísticas del run (igual que `PipelineStatus.last`) | radar y todo lo demás |
| `sensor.received`   | `{ id, itemId, title }`                                | `GET /sensor`, radar  |
| `calendar.changed`  | `{ id }`                                               | `GET /calendar`       |
| `watch.changed`     | `{ id }` (id de la vigía; al empezar y al terminar)    | `GET /watches[/:id]`  |

## OpenAPI

`GET /openapi.json` existe pero **no documenta ninguna ruta**: las rutas se registran con `app.get`/`app.post` de Hono y no con rutas OpenAPI, así que el spec sale sin `paths`. El contrato es este archivo, y `GET /docs` lo sirve como Markdown.
