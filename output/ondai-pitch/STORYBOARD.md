# OndAI pitch — storyboard (180 s, 1920 × 1080, 30 fps)

The narration `assets/audio/narration.wav` (a copy of the repo's `pitch_final.wav`, untouched) is the master clock. Phrase bounds come from silence detection (`tools/phrases.json`); word positions inside a phrase are estimates — key words are placed by their share of the phrase. Every scene is a sub-composition built from a fragment in `src/scenes/` (see `WORKERS.md`). Times are **global** unless marked *local* (local = global − scene start).

Every number on screen comes from the repo README, the app's frozen demo week, or the deployed demo (read only). Nothing invented.

## Frame 1 — f01-intro · 0.00–15.00 · El equipo llega tarde
src: compositions/f01-intro.html · rules: kinetic-beat-slam, discrete-text-sequence, depth-scatter-assemble, svg-path-draw, gradient-text-sweep
- p01 0.00–1.79 «Lunes, siete de la mañana.»
- p02 2.36–5.71 «Tu equipo creativo ya vio lo que se hizo viral el fin de semana.» («viral» ≈ 3.9–4.3)
- p03 6.33–7.91 «Pero nadie sabe por qué funcionó…» («por qué» ≈ 6.9–7.3)
- p04 9.10–10.39 «…ni qué publicar esta semana.»
- p05 12.12–14.38 «Y para cuando lo descubren, la onda ya pasó.» («ya pasó» ≈ 13.6–14.3)

Dark, elegant, tense. 0–2.3: a big mono clock «LUN 07:00» (seconds ticking 06:59:57 → 07:00:00 at ≈0.9), clock ticks. 2.3–6.3: real viral pieces of the week pile up as dark cards in depth (scatter, slight 3D tilt), each with platform, author and real metrics, a soft ping per card; «VIRAL» lands in the gradient at ≈4.0, big. A pointer hops between cards without landing anywhere (no fake UI, no fake windows). 6.33: everything freezes, desaturates and blurs back; «¿POR QUÉ?» slams in center (gradient) at ≈6.9. 9.1–10.4: «¿Qué publicar esta semana?» — a bare week strip LUN…DOM with empty slots. 12.1: a thick orange wave rises to its peak (svg-path-draw); at «ya pasó» ≈13.5 it falls, the camera follows it down and the frame clears to the dark stage by 14.8 (tape-stop sound at 13.5).

Real pieces (frozen demo week, 11–18 oct 2026):
- YouTube · midudev · «La IA pone en apuros a Adobe» · 197 k vistas · 4 K likes
- YouTube · The AI Advantage · «ChatGPT Just Solved My Biggest Browser Problem» · 37,2 k vistas · 4,8× su mediana
- X · Google AI · «Our SynthID technology lets you easily verify if an image, video, or audio file is AI-generated…» · 1.715 likes · 406 reposts
- YouTube · TubeGuruji · «Build Social Media AI Agent Team Using Claude Code & Next.js» · 19,3 k vistas
- GitHub · outcrawlai/scout · 934 estrellas
- Hacker News · «What mathematicians should know about the Lean Theorem Prover: reliability & AI» · 208 puntos · 58 comentarios

## Frame 2 — f02-reveal · 15.00–19.00 · Esto es OndAI (built)
- p06 15.02–17.03 «Esto es OndAI, tu AI trend analyst.»
Plane + wordmark reveal with shimmer, the thick orange wave, «AI trend analyst» in the gradient; fly-through into the product.

## Frame 3 — f03-radar · 19.00–28.00 · El Radar (built)
- p07 19.10–25.29 «Cada lunes abres el Radar y ves la onda de la semana: qué temas suben, en qué etapa están y qué tanto encajan con tu marca.»
Landing hero (recording) → Radar's week (still, «01 Qué crece») → «La onda» life-cycle curve (recording, «02 Cuándo entrar» on ZONA «ENTRA YA») → topic «IA open source» (still, «03 Por qué»), chips dock above the screen.

## Frame 4 — f04-elegir · 28.00–38.00 · Elegir, como en Tinder
src: compositions/f04-elegir.html · rules: cursor-drag, camera-cursor-tracking, kinetic-beat-slam
- p08 28.10–29.68 «Después eliges como en Tinder.»
- p09 30.43–31.69 «Este sirve: a la derecha.»
- p10 34.02–36.27 «Este ya lo contó todo el mundo: a la izquierda.»

Real deck (`assets/capture/elegir.mp4`, 1440 × 810 CSS at 2×, 11.13 s; log `elegir.json`): the front card «IA para multitarea» (encaje 8/10, +460 %, En crecimiento) is dragged right (mouse down 2.18 → up 3.47, the app stamps «SIRVE»); the next, «Verificación con IA» (encaje 8/10), dragged left (down 6.94 → up 8.60, «NO SIRVE»). Two cuts of the same recording, invisible: clip 1 media 0.12→5.0 at 28.00 (release lands 31.35), clip 2 media 5.48→11.13 at 32.88 (release lands 36.00). Pointer replayed from the log on both. Typographic beats beside the screen: at 30.4 «SIRVE →» (marker), at 34.0 «← NO SIRVE». For the left one, a small truthful annotation from the data: «Verificación con IA · ya llegó al español: 8 creadores en ES, 8 en EN». And the difference the voice draws, as a compact life-cycle explainer next to the screen (README stage table): «Emergente — Entra ya» vs «Saturado — solo con ángulo propio» — labeled as the rule, not as this card's stage.

## Frame 5 — f05-adapt · 38.00–47.00 · Ángulo, gancho, borrador
src: compositions/f05-adapt.html · rules: ai-tracking-box, coordinate-target-zoom, camera-cursor-tracking
- p11 38.09–42.66 «Lo que eliges llega con el ángulo, el gancho y el borrador, en la voz de 30X.» («ángulo» ≈ 39.3, «gancho» ≈ 40.2, «borrador» ≈ 41.0, «voz de 30X» ≈ 42.0)

Real «Cómo lo contamos» for «Shadow AI» (`assets/capture/contar.mp4`, 15.9 s, log `contar.json`; marks: ángulo 2.25, gancho 4.62, click «Aprobar al calendario» 7.36, dialog 7.51, day 9.94, hour 11.46, «Programar» 13.27). One continuous offset for f05 and f06: **global = media + 36.70** (media 1.30 at 38.00). Editorial callouts land on the real blocks as the voice names them: «ÁNGULO» (the angle text, CSS ≈ x 382–1339, y 194–266), «GANCHO» (the chosen hook, CSS ≈ x 382–702, y 313–382), «BORRADOR» (LinkedIn preview, CSS y ≥ 481), then «EN LA VOZ DE 30X». At 42.7 a small evidence note: «Basado en datos: 12 creadores esta semana, +247 %» (that is the hook's own data). The pointer then clicks «Aprobar al calendario» (44.06) and the dialog opens (44.2). Camera: one push for the sentence. f05 ends on the open dialog with the screen exactly where f06 starts (no handoff between f05 and f06).

## Frame 6 — f06-approve · 47.00–60.00 · Una persona aprueba
src: compositions/f06-approve.html · rules: camera-cursor-tracking, cursor-click-ripple, kinetic-beat-slam, card-morph-anchor
- p12 47.10–49.43 «Una persona aprueba y queda en el calendario.»
- p13 50.25–51.75 «Nada se publica solo.»
- p14 54.11–56.79 «Tu equipo deja de buscar a mano y empieza a crear.»

Continues the contar recording at the same offset (media 10.30 at 47.00): hour chosen (48.16), «Programar» (49.97), toast «Quedó programado» (≈50.1). 50.25: the screen dims and recedes; «NADA SE PUBLICA SOLO» with «APROBACIÓN HUMANA» as a pill/gradient. 52.0–54.0: a content card («Post de LinkedIn · Shadow AI · mar 20 · 9:00 a. m.», the piece just scheduled) travels to the calendar. 52.8: the team's real planned week (`assets/stills/calendario.png`, deployed demo, «Próxima semana · 4 piezas programadas», each approved by «Equipo de medios 30X»). 54.1–56.8: kinetic line «deja de buscar a mano» (struck through) → «empieza a crear». Clean calendar view to close the act.

## Frame 7 — f07-dive · 60.00–70.00 · ¿Cómo sabe qué va a despegar?
src: compositions/f07-dive.html · rules: 3d-camera-flight, depth-scatter-assemble, svg-path-draw
- p15 60.11–61.70 «¿Y cómo sabe OndAI qué va a despegar?»
- p16 62.83–63.68 «Adentrémonos.»
- music only 63.7–70.1 (riser into 70.1)

Frame clears. The question in big type. At «Adentrémonos» the camera dives forward: a field of signal points (seeded) streams past, organizes into lines that become a rising curve; we travel along it into the technical space. Ends on a clean dark field where f08's sources begin. Sounds: whoosh-long at 62.9, riser 68.4–70.0, impact 70.1.

## Frame 8 — f08-sources · 70.00–82.00 · Doce fuentes, 1,8×
src: compositions/f08-sources.html · rules: depth-scatter-assemble, stat-bars-and-fills, counting-dynamic-scale, gradient-text-sweep
- p17 70.10–73.92 «OndAI lee doce fuentes públicas cada dos horas, con ocho semanas de historia.»
- p18 74.79–78.73 «Cuando un tema crece 1,8 veces sobre su promedio, hay señal.» («uno coma ocho» ≈ 75.4–76.2)

The 12 public sources (README): Bluesky, Google Noticias, Hacker News, GitHub, Hugging Face, arXiv, Product Hunt, YouTube, LinkedIn, Instagram, X, Newsletters. They converge onto an 8-week timeline (S1…S8) with «cada 2 h». **Two lanes, honestly:** Bluesky, Google Noticias, Hacker News and GitHub feed «Crecimiento (muestreo comparable)»; the other eight feed «Presencia y evidencia». The pipeline strip runs once: capturar → leer → agrupar → medir → explicar → adaptar → aprobar. 74.8: the real example «IA open source», creators per week [13, 6, 7, 4, 3, 4, 3, 15]: bars, the 4-week average (3,5) as a line, this week 15. Lift = (15 + 1) ÷ (3,5 + 1) = 3,56×. The threshold «≥ 1,8× y al menos 3 creadores» → «1,8×» big in the gradient with a short riser ending at 75.4 and an impact; one push-in. «hay señal» ≈ 78.2: the bar turns marker orange, «SEÑAL».

## Frame 9 — f09-measure · 82.00–92.00 · El código mide, la IA explica
src: compositions/f09-measure.html · rules: split-tilt-cards, counting-dynamic-scale, discrete-text-sequence
- p19 82.02–84.97 «Y aquí está la clave: el código mide y la IA redacta.»
- p20 85.81–89.61 «La etapa y el crecimiento salen de conteos, no de la opinión de un modelo.»

Split frame. Left «EL CÓDIGO MIDE» (mono, data): creadores distintos 15 · ventana 7 días · lift 3,56× · etapa «En crecimiento» (rule: lift ≥ 1,8 dos semanas seguidas o muchos creadores). Numbers and the curve appear first. Right «LA IA EXPLICA»: the real explanation types itself from those numbers — «El debate sobre alternativas open source a la IA crece en Bluesky, impulsado por creadores de contenido.» + the cited trigger «ArtCraft Releases Free Open-Source Adobe Alternatives…» + one pattern «8 de 12 piezas que despegaron las publicó un creador de contenido, frente a 1 de 9 del resto.» Arrows from numbers into the text. The line «EL CÓDIGO MIDE. LA IA EXPLICA.» («IA» in the gradient). At «no de la opinión de un modelo»: a small note «El modelo solo cita piezas que recibió».

## Frame 10 — f10-languages · 92.00–105.00 · Inglés → español
src: compositions/f10-languages.html · rules: svg-path-draw, nudge-curve, gradient-text-sweep, camera-cursor-tracking
- p21 92.11–96.52 «Por eso sabes si un tema ya despegó en inglés y todavía nadie lo cuenta en español.»
- p22 97.15–98.21 «Esa es tu ventana.»
- music 98.2–105.1

92.1: the real Radar «Por idioma» click (`assets/capture/radar.mp4`, log `radar.json`, click at media 5.19 on the «Por idioma» tab; lines EN/PT/ES draw in). Then three waves as motion graphics: inglés (lavender) rises first, portugués (green) next, español (orange) late; the gap between EN and ES is highlighted as «TU VENTANA» at 97.2. The real case beside it: «IA open source · 13 creadores en inglés, 2 en español · el inglés va 7 semanas por delante». «INGLÉS → ESPAÑOL» in the gradient; then «Llega antes al español». Secondary note, small and labeled: «En las 18 olas del backtest, el artículo de Wikipedia en español llegó con una mediana de 28 días después del inglés (9 olas con artículo propio).»

## Frame 11 — f11-vigia · 105.00–120.00 · Vigía: 12 de casi 400
src: compositions/f11-vigia.html · rules: stat-bars-and-fills, counting-dynamic-scale, coordinate-target-zoom
- p23 105.13–107.25 «Vigía sigue el tema que le importa a tu empresa.»
- p24 108.09–111.38 «De casi cuatrocientas piezas, solo doce pasan el filtro.» («cuatrocientas» ≈ 108.9, «doce» ≈ 110.3)
- music 111.4–120.1

The real Vigía (`assets/stills/vigia.png`, deployed demo, followed topic «IA en empresas · 72 atrapadas · busca cada hora», last search panel 417 → 411 → 131 → 100 → 27 → 24 → 12 atrapadas, «Leer las 12 costó USD 0,00059»). Then the documented funnel (README, real search «negocios»), labeled «Búsqueda real de «negocios»»: 623 encontradas → 378 en inglés o portugués → 132 del tema → 59 de las últimas 72 h → 19 virales → **12 atrapadas**, counted one after another; «12 DE 400» in the gradient (the voice's «casi cuatrocientas» = the 378 EN/PT pieces). During the music: the caught pieces (still) with their real «Adaptar» buttons, and «Leerlas costó USD 0,006».

## Frame 12 — f12-backtest · 120.00–135.00 · Probado contra el pasado
src: compositions/f12-backtest.html · rules: counting-dynamic-scale, stat-bars-and-fills, kinetic-beat-slam
- p25 120.10–123.63 «Lo probamos contra el pasado, solo con lo que se sabía en cada momento.»
- p26 124.38–128.45 «Detectó las dieciocho ondas de IA, con diez días y medio de ventaja en mediana.» («dieciocho» ≈ 124.9, «diez días y medio» ≈ 126.4)
- music 128.5–135.1

The real Evaluación (`assets/stills/evaluacion.png`): «¿Lo habría visto venir?», the three cards and the wave-by-wave table. Animated numbers: **18/18** olas detectadas (riser ending 124.8, impact), **14** antes de la semana del pico, **10,5 días** de anticipación mediana, **2** falsas alarmas en **10** temas estables. A time axis with the 18 waves (names from the table: ChatGPT Atlas, Claude Code, DeepSeek R1, Gemini 3, Genie 3, Ghibli, GPT-5, …). Small, always visible note: «Backtest retrospectivo; criterios ajustados con las series analizadas.» Never «garantiza».

## Frame 13 — f13-trust · 135.00–150.00 · Público, barato, con una persona
src: compositions/f13-trust.html · rules: discrete-text-sequence, spring-pop-entrance, gradient-text-sweep
- p27 135.10–138.03 «Solo usa contenido público, sin iniciar sesión.»
- p28 138.83–141.84 «Cuesta entre cuarenta y cuarenta y cinco dólares al mes.»
- p29 142.62–144.52 «Y una persona aprueba cada pieza.»
- music 144.5–150.1

Three messages, one at a time: «Solo contenido público» (sub: «sin iniciar sesión · sin datos personales»); «USD 40–45/mes» in the gradient (sub: «escenario estimado: 3 temas en Vigía cada hora · la lectura de la semana medida: USD 4,16»); «Aprobación humana» with the flow Borrador → Una persona aprueba → Calendario. In the music, the three settle together as a calm row.

## Frame 14 — f14-pilot · 150.00–164.00 · El piloto
src: compositions/f14-pilot.html · rules: waterfall-entry, stat-bars-and-fills
- p30 150.10–153.80 «Proponemos un piloto de un mes con el equipo de medios de 30X.»
- p31 157.10–161.22 «Si al menos dos de los cinco temas de cada semana se producen, OndAI se queda.»

A four-week board: «Piloto · 1 mes · OndAI × equipo de medios 30X». Each week shows 5 proposed topics; a clear threshold line «≥ 2 de 5 producidos» per week; checks fill as an example of the criterion (marked «criterio de éxito», not results). «OndAI se queda» lands at ≈160.6. It reads as a measurable experiment.

## Frame 15 — f15-cost · 164.00–172.00 · Una fracción
src: compositions/f15-cost.html · rules: stat-bars-and-fills, counting-dynamic-scale
- p32 164.12–167.28 «Por una fracción de lo que cuesta una suite de social listening.»

Same base, labeled: USD por mes. OndAI USD 40–45/mes (costo de operación estimado: modelos, búsquedas y hosting) vs suite de social listening USD 19.000–50.000/año = USD 1.583–4.167/mes (licencia de software; medianas de Brandwatch, Meltwater y Sprout Social según Vendr). Bars to scale (the OndAI bar is a sliver). «≈ 1–3 %» of the suite. Small note: «Software frente a operación: no es el mismo tipo de costo.»

## Frame 16 — f16-close · 172.00–180.00 · Un paso adelante
src: compositions/f16-close.html · rules: svg-path-draw, gradient-text-sweep, spring-pop-entrance
- p33 172.11–174.11 «Tu equipo, siempre un paso adelante.»
- p34 174.91–175.59 «¿Empezamos?»

Final hit at 172.1. Logo (plane + OndAI), the wave advancing gently into the future (right). «Tu equipo, siempre UN PASO ADELANTE.» (gradient on «un paso adelante»). Below, discreet: «OndAI × 30X — Piloto de 1 mes». «¿Empezamos?» small at 174.9. Logo holds; fade to black 178.8–180.
