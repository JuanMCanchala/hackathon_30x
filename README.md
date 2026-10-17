# Radar 30X

**Qué temas de IA están despegando en redes, por qué funcionan y cómo los cuenta 30X.**

Reto «Radar de contenido» de 30X, Hackathon 30X (octubre de 2026). Esta rama (`feat/radar`) es el proyecto completo; la rama `feat/mandato` guarda el proyecto anterior del equipo.

## La pregunta

> ¿Cuáles son los 10 temas de IA que más están creciendo esta semana en LinkedIn, por qué y cómo lo adaptamos?

Hoy el equipo de medios de 30X paga servicios de scraping que cuestan miles de dólares al año y solo traen datos: no dicen por qué algo funcionó, si es una tendencia que empieza o una que ya todos copiaron, ni si le sirve a su audiencia. Radar responde las tres cosas en la primera pantalla, por menos de lo que cuesta un café a la semana.

## Lo que hace

| Pantalla                               | Qué responde                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Radar de la semana** (`/`)           | El titular de la semana, **la ola** (la curva del ciclo de vida con los 10 temas en su etapa y la ventana para entrar) y los 10 temas que más crecen: crecimiento, curva de 8 semanas, dónde se mueve, momento recomendado y encaje con 30X. Filtros por red, idioma y «sin explotar por 30X». |
| **Se está formando**                   | Temas que suben en el carril técnico (GitHub, Hacker News, Hugging Face, X, Bluesky) y todavía no llegan a LinkedIn ni a Instagram: la ventaja de llegar primero.                                                                                                                              |
| **Tema** (`/tema/[id]`)                | Por qué crece, qué tienen en común las piezas que despegaron (contado, no adivinado), la evidencia medida contra la mediana de cada autor, el encaje con 30X, la curva, qué lo disparó y la historia larga.                                                                                    |
| **Cómo lo contamos**                   | Post de LinkedIn con la voz de Andrés Bilbao, carrusel de Instagram, guion de Reel o TikTok, video de YouTube, tres ganchos y qué evitar. Se copia o se aprueba al calendario; nada se publica solo.                                                                                           |
| **Calendario** (`/calendario`)         | Lo que el equipo aprobó, por día, listo para copiar.                                                                                                                                                                                                                                           |
| **Referentes** (`/referentes`)         | Lo que le funciona a 30X y a Andrés Bilbao, medido contra su propia mediana, y los temas que crecen y todavía no han tocado.                                                                                                                                                                   |
| **Sensor** (`/sensor` y `apps/sensor`) | La comunidad como sensor: cualquiera manda un post público que vio funcionar (desde la web o con la extensión de Chrome) y el radar lo lee, lo etiqueta y lo suma a su tema.                                                                                                                   |
| **Evaluación** (`/evaluacion`)         | ¿Lo habría visto venir? El backtest contra olas de IA que ya pasaron, con qué datos se mide la semana y cuánto costó.                                                                                                                                                                          |
| **Pregúntale al radar** (⌘K) y **MCP** | Preguntas libres con respuesta citada, desde la web o desde cualquier asistente con el servidor MCP.                                                                                                                                                                                           |

## Cómo funciona

```text
capturar ─▶ leer ─▶ agrupar ─▶ medir ─▶ explicar ─▶ adaptar ─▶ aprobar
```

1. **Capturar** (`packages/sources/scripts/capture.mjs`, cada 2 horas): guarda cada respuesta tal como llegó, para que la historia se acumule y cualquier parser se pueda volver a correr. `backfill.mjs` repite las mismas búsquedas para las 8 semanas anteriores.
2. **Leer** (`apps/api/src/pipeline/enrich.ts`): el modelo lee cada pieza una vez y anota de qué tema concreto habla, cómo abre (cifra, pregunta, contraintuitivo…), el formato, la emoción, la audiencia y quién la publica. Las piezas de semanas pasadas solo necesitan su tema, así que reciben una lectura liviana.
3. **Agrupar** (`packages/core/src/cluster.ts`): las etiquetas se convierten en embeddings multilingües («agentes de IA para ventas» y «AI sales agents» quedan juntas) y se unen a un tema por su parecido con la etiqueta que lo abrió, así los temas no se van comiendo a sus vecinos. Una etiqueta necesita al menos dos piezas: una tendencia se repite por definición.
4. **Medir** (`packages/core`): el código, no el modelo, calcula el crecimiento, la etapa, los outliers y los patrones.
5. **Explicar** (`apps/api/src/services/explain.ts`): el modelo redacta por qué crece y si le sirve a 30X a partir de los conteos, y solo puede citar piezas que recibió.
6. **Adaptar y aprobar** (`apps/api/src/services/adapt.ts`): las piezas en la voz de 30X; una persona las aprueba al calendario.

Todas las respuestas del modelo quedan grabadas: la demo, las pruebas y CI las reproducen sin red.

## Cómo medimos que algo crece

- **Creadores distintos, no piezas.** Cien posts de una misma cuenta no son una tendencia. Es la unidad del sistema de detección de tendencias de Snap (2026).
- **Ventanas de 7 días que terminan ahora,** no semanas de calendario: un lunes no parece una semana que cae.
- **Lift** = (creadores de esta semana + 1) ÷ (promedio de las 4 semanas anteriores + 1). Hay señal con lift ≥ 1,8 y al menos 3 creadores.
- **Solo con fuentes que se muestrean igual cada semana:** Bluesky, Google Noticias, Hacker News y los repositorios nuevos de GitHub, todos con el mismo tope de resultados por búsqueda y semana. LinkedIn, Instagram, YouTube, X y TikTok dicen dónde ya llegó cada tema y aportan la evidencia; sus feeds muestran solo lo reciente y inflarían la semana actual.

| Etapa          | Regla (la primera que se cumple)                                                                    | Momento                       |
| -------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| En declive     | creadores y engagement por pieza caen dos semanas seguidas                                          | No entres                     |
| Saturado       | muchos creadores (≥ P90), o crecimiento plano con 20 % menos de engagement por pieza que en su pico | Solo con ángulo propio        |
| En crecimiento | lift ≥ 1,8 dos semanas seguidas, o con muchos creadores (≥ P50)                                     | Esta semana                   |
| Emergente      | lift ≥ 1,8 con pocos creadores (< P50)                                                              | Entra ya, si el encaje es ≥ 7 |
| Estable        | el resto                                                                                            | Observa                       |

**Por qué funcionó una pieza:** se compara con la mediana de su propio autor (como los outliers de vidIQ o 1of10), no con una cuenta de un millón de seguidores. Entre las piezas que superan 2× esa mediana se cuenta qué ganchos, formatos, días, horas y tipos de autor aparecen más que en el resto: «7 de 10 piezas que despegaron abren con una cifra, frente a 3 de 40 del resto».

## ¿Lo habría visto venir?

`pnpm eval` corre el detector semana por semana sobre 18 olas de IA de 2025 y 2026 (DeepSeek R1, MCP, vibe coding, imágenes estilo Ghibli, Veo 3, GPT-5, Nano Banana, Sora 2, Gemini 3 y otras) y 10 temas estables de control (Excel, Linux, Python…), con solo lo que se sabía en cada momento. Usa historia de Wikipedia, Hacker News y Bluesky.

|                                  | Resultado                                   |
| -------------------------------- | ------------------------------------------- |
| Olas detectadas a tiempo         | 18 de 18 (14 antes de la semana de su pico) |
| Anticipación, mediana            | 10,5 días                                   |
| Falsas alarmas en temas estables | 2 de 10                                     |
| Hacker News frente a Wikipedia   | la señal aparece 7 días antes en la mediana |

Los criterios se ajustaron después de ver los datos y lo decimos: exigir que dos fuentes coincidan (con una sola, 60 a 80 % de falsas alarmas) y medir Wikipedia con la mediana diaria (picos de bots). CI corre el backtest en cada cambio y falla si detecta menos del 70 % de las olas o da más de 30 % de falsas alarmas.

## Fuentes

Todo es contenido público, leído sin iniciar sesión en ninguna red.

| Fuente                                                     | Qué aporta                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Bluesky (búsqueda pública)                                 | Conversación con engagement e historia completa: la base del crecimiento     |
| Google Noticias (RSS)                                      | Qué publican los medios, por semana; el «qué lo disparó»                     |
| Hacker News, GitHub, Hugging Face, arXiv, Product Hunt     | El carril técnico, donde las olas de IA se forman                            |
| YouTube (búsqueda de la semana y canales)                  | Videos con vistas, likes y fecha                                             |
| LinkedIn (páginas de empresa y posts públicos)             | Posts con reacciones y comentarios                                           |
| Instagram (perfiles públicos)                              | Posts y reels con likes, comentarios y vistas, incluidos 30X y Andrés Bilbao |
| X (timelines públicos por cuenta)                          | Lo que dicen los laboratorios y quienes construyen IA                        |
| Newsletters (TLDR AI, The Rundown, Ben's Bites, Import AI) | Lo que la curaduría destacó                                                  |
| La comunidad (sensor)                                      | Posts de LinkedIn, Instagram o TikTok que alguien vio funcionar              |

LinkedIn, Instagram y TikTok no tienen una búsqueda pública. Radar llega a ellos por tres caminos: perfiles semilla verificados, la comunidad como sensor y, si se configura `APIFY_TOKEN`, la búsqueda de posts de LinkedIn por palabra clave a USD 0,002 por post.

## Cuánto cuesta

La lectura de una semana completa (decenas de miles de piezas) cuesta unos pocos dólares de modelo; la pantalla Evaluación muestra el costo real de la semana. Las fuentes abiertas no cuestan nada. Una suite de social listening cuesta entre USD 19.000 y 50.000 al año (medianas de Brandwatch, Meltwater y Sprout Social según Vendr).

## Correrlo

Requisitos: Node 22 o más y pnpm.

```bash
pnpm install
cp env.example .env              # y pon FIREWORKS_API_KEY

# 1. Datos: una captura ahora (o cada 2 horas con --every 120) y las 8 semanas anteriores
node packages/sources/scripts/capture.mjs
node packages/sources/scripts/backfill.mjs

# 2. La API (http://localhost:4100) y la web (http://localhost:3300)
pnpm dev

# 3. Procesar lo capturado: leer, agrupar, nombrar y explicar
curl -X POST localhost:4100/api/v1/pipeline/run -H 'content-type: application/json' -d '{}'
```

Sin llave, `LLM_MODE=replay` reproduce las respuestas grabadas y `data/snapshot` carga la semana congelada de la demo.

- **Pruebas:** `pnpm test` (sin red). **Backtest:** `pnpm eval`. **Tipos y lint:** `pnpm typecheck`, `pnpm lint`.
- **MCP:** `claude mcp add radar-30x --env RADAR_API_URL=http://localhost:4100 -- pnpm --dir apps/mcp dev`
- **Extensión:** en Chrome, `chrome://extensions`, modo desarrollador, «Cargar descomprimida» y elegir `apps/sensor`.

## Estructura

```text
apps/api          Hono + PGlite: pipeline, radar, temas, adaptaciones, calendario y sensor
apps/web          Next.js 16: radar, tema, calendario, referentes, sensor, evaluación
apps/mcp          servidor MCP (stdio)
apps/sensor       extensión de Chrome
packages/core     lógica pura: crecimiento, etapas, outliers, patrones, temas, backtest
packages/sources  captura, parsers, historia y lector de posts públicos
data/             semana congelada de la demo y respuestas grabadas del modelo
```

## Límites, dichos de frente

- El crecimiento se mide en fuentes con historia pareja (Bluesky, noticias, Hacker News, GitHub); LinkedIn e Instagram aportan presencia y evidencia, no la curva.
- La búsqueda de YouTube da fechas aproximadas («hace 2 días»); esas piezas no cuentan para el crecimiento.
- Instagram y X limitan las consultas por hora; la captura reintenta en la siguiente vuelta.
- El modelo puede etiquetar mal una pieza; el radar trabaja con miles, y cada tema muestra su evidencia para revisarla.
- Solo se guarda contenido público y el nombre público de su autor: nada de correos, teléfonos ni perfiles privados.
