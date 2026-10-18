---
workflow: general-video
flow: automation
storyboard: no
message: "OndAI le dice al equipo de medios de 30X qué tema de IA despega, por qué funciona y cómo contarlo, antes que nadie en español."
destination: presentación ante el jurado de la Hackathon 30X (pantalla grande) y web
aspect: "16:9"
language: es
audience: jurado de la Hackathon 30X y el equipo de medios de 30X
length: 180s
angle: problema → producto real → mecanismo con evidencia → piloto medible
---

## Intent

Video pitch cinematográfico de OndAI para el reto «Radar de contenido» de 30X: contar una historia visual convincente, demostrar que OndAI es un producto real, explicar su ventaja con evidencia y conseguir que el jurado entienda por qué 30X debería probarlo.

## Assets

- Narración definitiva: `pitch_final.wav` en la raíz del repo (copiada sin cambios a `assets/audio/narration.wav`). No se regenera, recorta ni acelera.
- Interfaz real: grabaciones y capturas de la demo local (semana congelada, `DEMO_MODE=true`) y de la demo desplegada (solo lectura).
- Música y efectos: originales, sintetizados en local (`tools/audio/`).

## Customizations

- Fondos oscuros con brillos de malla animados, grano fino y viñeta; el producto aparece como pantallas claras reales sobre ese escenario.
- Palabras clave con el degradado de la marca (naranja → lavanda) mientras se sostienen.
- Push-ins controlados (uno por frase como máximo) y transiciones horizontales.
- Mezcla: voz al frente, música tallada bajo la voz (carve), efectos 10–18 dB por debajo.

## Notes

- 1920 × 1080, 30 fps, H.264 + AAC 48 kHz estéreo.
- Entregables: MP4 final, composición HyperFrames, fuentes de escenas, SRT en español, README.
