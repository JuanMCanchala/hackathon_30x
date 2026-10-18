# OndAI — video pitch (Hackathon 30X)

Video de 180 s que presenta OndAI ante el jurado del reto «Radar de contenido». Está hecho con [HyperFrames](https://hyperframes.heygen.com) (HTML → video) sobre la narración grabada `pitch_final.wav`.

| Entregable | Ruta |
| --- | --- |
| Video final (H.264 + AAC 48 kHz estéreo, 1920 × 1080, 30 fps; 139 MB, fuera de git por el límite de 100 MB de GitHub: se genera con los pasos de abajo) | `ondai-pitch-final.mp4` |
| Subtítulos en español | `ondai-pitch-final.srt` |
| Composición principal de HyperFrames | `index.html` (y `ondai-pitch-master.html`, una copia) |
| Escenas (fuente editable) | `src/scenes/f01-intro.html` … `f16-close.html` |
| Escenas generadas (sub-composiciones) | `compositions/` |
| Storyboard con tiempos, datos y fuentes de cada cifra | `STORYBOARD.md` |
| Diseño para video (paleta, tipografía, movimiento) | `design.md` |

## Volver a renderizar

Requisitos: Node 22, FFmpeg, Python 3 con `numpy` y `scipy`, y el plugin HyperFrames de Claude Code (o `npx hyperframes`, versión 0.8.171).

```bash
cd output/ondai-pitch
npm install                                 # @hyperframes/core, para el carve de la música
node tools/build-scenes.mjs                 # src/scenes/*.html → compositions/*.html (+ kit compartido)
python3 tools/audio/build_audio.py          # música y efectos → assets/audio/music.wav, sfx.wav
node tools/build-index.mjs                  # index.html: fondo, 16 escenas, grano, 3 pistas de audio
node <plugin>/skills/hyperframes-audio/scripts/carve.mjs --comp index.html --bed music --voice narration --strength 0.6
npx hyperframes@0.8.171 check .             # lint, runtime, layout, movimiento y contraste
npx hyperframes@0.8.171 render . -q high --video-frame-format png -o renders/ondai-pitch-render.mp4
python3 tools/make_srt.py > ondai-pitch-final.srt
```

`<plugin>` es la carpeta del plugin, p. ej. `~/.claude/plugins/cache/hyperframes/hyperframes/0.8.171`. Para revisar un tramo sin renderizar todo: `node tools/build-index.mjs --window 15,28` y luego `npx hyperframes snapshot --at 1,5,9` (tiempos relativos al tramo) o `render`. Vuelve a correr `build-index` sin `--window` (y el carve) antes del render final.

El render tarda unos 25 min en esta máquina (captura con GPU, 1 worker).

## Cómo está hecho

- **Narración**: `assets/audio/narration.wav` es una copia byte a byte de `pitch_final.wav` (180,0 s). No se recorta, no se acelera, no se regenera. La sincronía sale de los límites reales de cada frase, medidos con detección de silencios (`tools/phrases.json`); la transcripción automática se usó solo como apoyo porque sus tiempos por palabra se desfasan.
- **Escenas**: cada escena es un fragmento en `src/scenes/` (marcado, estilos, una línea de tiempo GSAP en pausa y sus efectos de sonido). `tools/build-scenes.mjs` la envuelve con el kit común (`src/kit.css`, `src/kit.js`: fuentes de la marca, cámara sobre capturas, cursor, palabra con degradado, contadores y transiciones).
- **Producto real**: `assets/capture/*.mp4` son grabaciones de interacciones reales en la demo local con la semana congelada (`DEMO_MODE=true`, `LLM_MODE=replay`, base de datos temporal): la landing, el Radar y la pestaña «Por idioma», Elegir (deslizar a la derecha y a la izquierda) y «Cómo lo contamos» con la aprobación al calendario. Cada `.json` guarda la ruta real del puntero; el cursor del video la reproduce sobre el elemento real en el momento real. `assets/stills/*.png` son capturas de página completa a 2×; Vigía y el calendario son de la demo desplegada (solo lectura, sin clics). Las herramientas están en `tools/record.mjs`, `tools/stills.mjs` y `tools/explore.mjs`.
- **Música y efectos**: originales, sintetizados en local con numpy/scipy (`tools/audio/`): una pista de 96 BPM en re menor que sigue los actos y una librería de efectos (whoosh, pop, clic, riser, impact, shimmer, golpe final). Sin muestras ni descargas, así que no hay licencias de terceros. La música se talla bajo la voz con el *voiceover carve* de HyperFrames.

## De dónde sale cada cifra

Todo está en el `README.md` del repo, en la semana congelada de la demo o en la demo desplegada. El detalle por escena está en `STORYBOARD.md`. Las precisiones metodológicas que aparecen en pantalla:

- Crecimiento: solo Bluesky, Google Noticias, Hacker News y GitHub (muestreo comparable). Las otras ocho fuentes aportan presencia y evidencia.
- Backtest: «Backtest retrospectivo; criterios ajustados con las series analizadas.» Las anticipaciones de las 18 olas coinciden con `packages/core/fixtures/backtest/report.json`.
- Idiomas: la mediana de 28 días entre el artículo de Wikipedia en inglés y en español se rotula como resultado de las 18 olas analizadas (9 con artículo propio).
- Vigía: el embudo 623 → 12 se rotula como la búsqueda documentada de «negocios», no como una corrida en vivo.
- Costos: misma base (USD por mes). OndAI USD 40–45/mes es costo de operación estimado; la suite (USD 19.000–50.000 al año = 1.583–4.167 al mes) es licencia de software.
- Piloto: el tablero ilustra el criterio de éxito (≥ 2 de 5 temas producidos por semana); no son resultados.

## Notas

- En Elegir no hay temas «Saturados» esta semana: el contraste Emergente/Saturado se muestra como la regla del README, no como la etapa de la tarjeta descartada. La descartada («Verificación con IA») sí ya llegó al español (8 creadores en ES y 8 en EN).
- La tarjeta «Post de LinkedIn · Shadow AI · mar 20 · 9:00 a. m.» que viaja al calendario es un gráfico: el calendario de fondo es el de la demo desplegada, cuya semana es otra.
- Las rutas de las capturas usan la demo local en `http://localhost:3300` (API en `:4100`) y la desplegada en `https://ondai.vercel.app`.

## Verificación del render entregado

- `ffprobe`: H.264 High, 1920 × 1080, yuv420p, 30 fps, 5400 fotogramas; AAC LC 48 kHz estéreo; 180,000 s; 133 MB.
- Sonoridad (EBU R128): −17,9 LUFS integrados, pico −1,6 dBFS (HyperFrames baja la mezcla para quedar bajo −1 dBTP).
- Narración: correlación con `pitch_final.wav` en cinco tramos con 0 ms de desfase; ninguna palabra recortada ni acelerada.
- Mezcla: música y efectos 18,6 dB por debajo de la voz durante la narración (entre 12,5 y 25,7 según la frase); efectos de interfaz ~21 dB por debajo; impactos ≥ 10 dB por debajo.
- `hyperframes check`: 0 errores (lint, runtime, layout, movimiento, contraste). Avisos restantes: archivos de composición largos y, en la escena 9, texto atenuado a propósito detrás de la frase final.
- Sin fotogramas negros (salvo el fundido final) ni congelados de más de 2,5 s (`blackdetect`, `freezedetect`); hojas de contacto revisadas en todos los actos.
