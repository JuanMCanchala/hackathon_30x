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
| **La ola por idioma**                  | Lo viral sobre IA suele nacer en inglés o portugués y llega días después al español. El radar muestra cada tema en las tres olas y separa los que ya despegaron afuera y casi nadie cuenta en español: «Adáptalo al español» antes que nadie.                                                  |
| **Vigía** (`/vigia`)                   | Sigues un tema («negocios») y el radar lo busca cada hora en inglés y portugués. Reglas sin costo deciden qué atrapar y solo lo atrapado se lee: el texto de cada lámina de un carrusel, las ideas clave de un video y su idea en español, lista para adaptar.                                 |
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

## Lo viral nace en otro idioma

Las ideas sobre IA que se vuelven virales en español casi siempre funcionaron antes en inglés o en portugués. Radar mide cada tema por separado en los tres idiomas (creadores, etapa y lugar en su ola) y marca una **ventana abierta en español** cuando el inglés o el portugués ya tiene al menos 6 creadores esa semana y el español va en la cuarta parte o menos. Para cada tema mide además cuántas semanas le lleva el idioma líder al español.

En la página de cada tema, «Ya funcionó en inglés y portugués» pone cada pieza original junto a su idea en español, y las piezas que escribe el radar citan en qué originales se basaron: se adapta la idea, no se traduce palabra por palabra. (En una prueba de Kapwing, la versión localizada de un video en un canal en español sacó 3.897 vistas; la misma pieza como doblaje en el canal original, 32.)

## Vigía: seguir un tema

Escribes un tema y el radar lo convierte, una sola vez, en búsquedas y palabras clave en inglés y portugués. Desde ahí cada búsqueda es un embudo:

1. **Encontrar** (sin tokens): YouTube (lo de hoy o de esta semana), Bluesky, Hacker News y los perfiles de Instagram que sigue el radar, cuyos feeds públicos traen cada lámina de los carruseles. Los videos que podrían pasar se abren uno por uno para leer su fecha exacta, su canal y sus métricas.
2. **Decidir con reglas** (sin tokens, `packages/core/src/screen.ts`), en orden y cada una con su razón escrita: que esté en inglés o portugués, que el tema aparezca en el gancho (no en un enlace ni en el nombre del autor), que sea de las últimas 72 horas, que sea viral (2× o más la mediana de su autor, o entre el 25 % más rápido de su red en esa búsqueda), que no la hayamos atrapado antes y que quepa en el presupuesto de 12 por búsqueda. Las reglas están detrás de una sola función: un motor de decisiones como JEV puede tomar su lugar.

   **Con JEV** (si hay `TYPESAFE_API_KEY`): antes de las reglas, JEV, el modelo de decisiones de TypeSafe, responde dos preguntas cerradas por cada pieza en el idioma y la ventana correctos (hasta 120, las de más interacción): si el tema es de verdad el centro de la pieza (no una mención de paso, un enlace o el nombre del autor) y qué tanto le sirve a la audiencia de 30X, de 1 a 10. Desde 0,6 de probabilidad es del tema, diga lo que diga la palabra clave, y el encaje entra al ranking y a las razones («JEV: es del tema (93 %). Encaje con 30X: 8/10»). Tres piezas reales tardaron 282 ms en total y unos 470 tokens cada una: USD 0,00002 por pieza. Si JEV no responde, la búsqueda sigue con palabras clave y el reporte lo dice.

3. **Leer lo atrapado** (con tokens, solo esas 12): la idea en español, el texto de cada lámina (el modelo lee las imágenes), y el gancho y las ideas clave de cada video a partir de sus subtítulos.
4. **Adaptar**: cada pieza atrapada se convierte en post de LinkedIn, carrusel, guion de Reel y video de YouTube con la voz de 30X.

Una búsqueda real de «negocios» encontró 623 piezas; 378 estaban en inglés o portugués, 132 hablaban del tema, 59 eran de las últimas 72 horas, 19 eran virales y 12 se atraparon. Leerlas, con dos carruseles y dos videos, costó USD 0,006.

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

**Qué métricas de una pieza son públicas** (probado el 17 de octubre de 2026 con una pieza real de cada red, sin iniciar sesión):

| Red       | Se lee                                                                    | No es público                                  |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| TikTok    | vistas, likes, comentarios, compartidos, guardados y seguidores del autor | nada                                           |
| YouTube   | vistas, likes, comentarios, suscriptores del canal y duración             | dislikes                                       |
| Bluesky   | likes, reposts, respuestas, citas y guardados                             | nada                                           |
| Instagram | likes, comentarios, vistas de reels y seguidores (desde el perfil)        | compartidos y guardados (solo los ve el dueño) |
| LinkedIn  | reacciones, comentarios y seguidores de la empresa                        | compartidos e impresiones                      |
| X         | likes y respuestas                                                        | retuits, citas y vistas                        |

**Para buscar por palabra en Instagram, TikTok, LinkedIn y X** hace falta un proveedor de datos públicos. Con [treg.to](https://treg.to/catalog) (se paga por llamada: hashtags de Instagram a USD 0,0015, TikTok a USD 0,001, LinkedIn a USD 0,002) seguir 3 temas cada hora en dos idiomas cuesta unos USD 45 al mes; con Apify, unos USD 490.

## Quién más lo hace

| Herramienta              | Qué da                                                                      | Cómo consigue los datos                             | USD al mes |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| Sandcastles              | videos que superan lo habitual del creador, con gancho y formato desarmados | no lo publica                                       | 39–499     |
| Virlo                    | un agente convierte un nicho en palabras clave y rankea outliers; alertas   | datos públicos de TikTok, Instagram, YouTube y Meta | 49–199     |
| vidIQ, 1of10, ViewStats  | outliers de YouTube: vistas ÷ promedio del canal, en bandas 2×, 5× y 10×    | API oficial de YouTube y extensión                  | 0–249      |
| Shortimize               | sigue cuentas y avisa cuando un video se dispara                            | no lo publica                                       | 99–249     |
| Taplio, Kleo, AuthoredUp | bibliotecas de posts virales de LinkedIn y reescritura con tu voz           | extensión con la sesión del usuario; Kleo usa Apify | 20–199     |
| Foreplay                 | archivo de anuncios y tableros de inspiración                               | extensión y scraper de bibliotecas de anuncios      | 49–459     |

Ninguna usa el idioma como señal (viral en inglés o portugués, ausente en español), ninguna rankea carruseles de Instagram junto con video, LinkedIn y X, y todas explican el porqué para creadores individuales, no para la voz de una escuela de negocios y su audiencia en Latinoamérica.

## Cuánto cuesta al mes

Unos **USD 40 a 45 al mes** con 3 temas en Vigía buscados cada hora, y menos desde la segunda semana, cuando la historia ya está leída. Una suite de social listening cuesta entre USD 19.000 y 50.000 al año (medianas de Brandwatch, Meltwater y Sprout Social según Vendr), y no dice por qué funcionó una pieza.

| Concepto                                                                                                     | Supuesto                                                                                                                                           | USD al mes |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Lectura de la semana (DeepSeek V4.1 Flash en Fireworks: etiquetar, agrupar, explicar y encaje por tema)      | medido: USD 4,16 la semana del 10 al 17 de octubre por 71.354 piezas leídas, incluida la lectura liviana de 8 semanas de historia que no se repite | ≤ 18       |
| Vigía: leer lo atrapado (láminas, subtítulos, idea en español)                                               | USD 0,006 por búsqueda medidos con «negocios»; 3 temas × 24 búsquedas × 30 días                                                                    | ~ 13       |
| JEV en el embudo de Vigía                                                                                    | hasta 120 piezas por búsqueda × 470 tokens a USD 0,042 por millón; 2.160 búsquedas                                                                 | ≤ 5        |
| Fuentes abiertas (Bluesky, Google Noticias, Hacker News, GitHub, Hugging Face, YouTube público, newsletters) | lectura pública sin llave                                                                                                                          | 0          |
| Hosting (API con disco para PGlite + web en Vercel)                                                          | plan de entrada de Railway o Render; Vercel Hobby                                                                                                  | ~ 5–10     |
| Opcional: búsqueda por palabra en Instagram, TikTok y LinkedIn (treg.to)                                     | se paga por llamada                                                                                                                                | según uso  |

La pantalla Evaluación muestra el costo real de la semana medido en cada llamada al modelo. La lectura está medida; el resto de la tabla es la estimación para el piloto.

## Seguridad y datos

- **Solo contenido público, sin iniciar sesión** en ninguna red: ni cuentas propias ni falsas, ni saltarse protecciones (el criterio de Meta contra Bright Data y hiQ contra LinkedIn).
- **Datos personales (Ley 1581 de 2012):** se guarda el contenido público y el nombre público de su autor; nada de correos, teléfonos, perfiles privados ni los nombres de quienes comentan.
- **Secretos fuera del código:** las llaves (`FIREWORKS_API_KEY`, `TYPESAFE_API_KEY`, `APIFY_TOKEN`) solo se leen del entorno; `env.example` lista los nombres sin valores y ningún `.env` está en el repositorio.
- **Errores sin llaves:** si JEV rechaza una llamada, el mensaje se guarda sin la llave aunque el servidor la repita.
- **Nada se publica solo:** el radar propone y una persona del equipo aprueba cada pieza al calendario.
- **Sin red en pruebas y CI:** las respuestas del modelo quedan grabadas y JEV se prueba con respuestas simuladas.

## Correrlo

Requisitos: Node 22 o más y pnpm.

```bash
pnpm install
cp env.example .env              # y pon FIREWORKS_API_KEY (y TYPESAFE_API_KEY para JEV, opcional)

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
apps/web          Next.js 16: radar, tema, vigía, calendario, referentes, sensor, evaluación
apps/mcp          servidor MCP (stdio)
apps/sensor       extensión de Chrome
packages/core     lógica pura: crecimiento, etapas, outliers, patrones, temas, backtest
packages/sources  captura, parsers, historia y lector de posts públicos
data/             semana congelada de la demo y respuestas grabadas del modelo
```

## Límites, dichos de frente

- El crecimiento se mide en fuentes con historia pareja (Bluesky, noticias, Hacker News, GitHub); LinkedIn e Instagram aportan presencia y evidencia, no la curva.
- La búsqueda de YouTube da fechas aproximadas («hace 2 días») y ninguna para los shorts; esas piezas no cuentan para el crecimiento, y Vigía abre cada video candidato para leer su fecha exacta o lo descarta.
- Sin JEV, Vigía decide «del tema» por palabras clave en el gancho: rápido y sin costo, pero a veces deja pasar una pieza que solo menciona la palabra. Con JEV ese error baja, aunque JEV también se equivoca: cada decisión muestra su razón y su probabilidad para revisarla.
- Instagram y X limitan las consultas por hora; la captura reintenta en la siguiente vuelta.
- El modelo puede etiquetar mal una pieza; el radar trabaja con miles, y cada tema muestra su evidencia para revisarla.
- Solo se guarda contenido público y el nombre público de su autor: nada de correos, teléfonos ni perfiles privados.
