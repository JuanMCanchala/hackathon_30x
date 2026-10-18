# OndAI: design system

Sacado de la landing del equipo (`apps/web/public/ondai.html`, servida en `/`) midiendo el DOM renderizado. La app (`/radar` y el resto) usa estos mismos valores: viven como variables en `apps/web/app/globals.css` y como clases de Tailwind (`bg-paper`, `text-ink-2`, `bg-lavender`…).

## Color

| Token             | Claro     | Oscuro    | Uso                                                                    |
| ----------------- | --------- | --------- | ---------------------------------------------------------------------- |
| `--ink`           | `#201515` | `#fffdf9` | Texto principal, píldoras oscuras (botón «Ver la demo», filtro activo) |
| `--ink-2`         | `#5e5b52` | `#c5c0b1` | Texto secundario y etiquetas mono                                      |
| `--ink-3`         | `#8a847c` | `#8a847c` | Notas, ejes, pies de figura                                            |
| `--paper`         | `#efebe4` | `#140e0d` | Fondo de página (la arena de la landing)                               |
| `--sheet`         | `#fffdf9` | `#201515` | Tarjetas y paneles (el crema de la landing)                            |
| `--sheet-2`       | `#f6f3ed` | `#2a1f1d` | Bloques dentro de una tarjeta                                          |
| `--fill`          | `#eceae3` | `#342825` | Píldoras neutras, segmentados, buscador                                |
| `--rule`          | `#e2ddd3` | `#342825` | Bordes y divisores (el borde de la barra flotante)                     |
| `--rule-strong`   | `#c5c0b1` | `#4a3c38` | Bordes de píldoras de momento («Esta semana»), punteados               |
| `--noche`         | `#201515` | `#1a1311` | Superficies oscuras: el hero del radar, el panel de preguntas          |
| `--marker`        | `#ff4f00` | `#ff5f17` | La señal: «Entra ya», ventana abierta, botón principal, cifras grandes |
| `--on-marker`     | `#201515` | `#201515` | Texto sobre naranja (la landing escribe en tinta, no en blanco)        |
| `--lavender`      | `#c1b7ff` | `#c1b7ff` | Segunda voz: tarjetas destacadas, etiquetas sobre oscuro               |
| `--lavender-tint` | `#e6e1ff` | `#2e2850` | Fondo de «En crecimiento» y del encaje                                 |
| `--brand`         | `#3b33a8` | `#c1b7ff` | Enlaces y medidores (el índigo de «En crecimiento»)                    |

**Idiomas** (marcas, nunca texto): inglés `#5a54d6`, portugués `#2b8a3e`, español `#ff4f00`. Sobre el hero oscuro: `#c1b7ff`, `#8fd8a3` y crema.

**Etapas** (siempre con su nombre al lado):

| Etapa          | Texto     | Fondo     |
| -------------- | --------- | --------- |
| Emergente      | `#1e6b3a` | `#e6f2e8` |
| En crecimiento | `#3b33a8` | `#e6e1ff` |
| Saturado       | `#8a5a00` | `#fff0d4` |
| En declive     | `#5e5b52` | `#ecebe5` |

## Tipografía

Dos familias, autoalojadas desde la landing (OFL, ver `apps/web/app/fonts`):

- **Hanken Grotesk** 300, 400, 500, 700 y 800 para todo.
- **JetBrains Mono** 400, 500 y 700 para etiquetas pequeñas: fuente y red de una pieza («EN · LinkedIn · hace 3 h»), etiquetas de sección y atajos de teclado.

| Rol                               | Landing                                              | Clase en la app |
| --------------------------------- | ---------------------------------------------------- | --------------- |
| Titular de portada                | 400, 78 px, interlineado 1,04, tracking −0,045 em    | (solo landing)  |
| Titular de sección, segunda línea | 800, 62 px, tracking −0,035 em                       | `t-display`     |
| Título de bloque                  | 700, 64 px, tracking −0,035 em                       | `t-h1`          |
| Título de tarjeta                 | 700, 27 px, tracking −0,02 em                        | `t-h2`, `t-h3`  |
| Cifra grande                      | 800, 84–140 px, tracking −0,05 em, en naranja        | `t-figure`      |
| Cuerpo                            | 400, 16–17 px, interlineado 1,5                      | por defecto     |
| Etiqueta de sección               | JetBrains Mono 400, 13 px, mayúsculas, +0,1 em, «• » | `eyebrow`       |

Los titulares de la landing combinan dos pesos: la primera línea fina (300–400) y la segunda gruesa (800), por ejemplo «Cuando por fin lo encuentras, **la onda ya pasó.**».

## Forma

- **Radios:** tarjetas 28 px (`.sheet`), tarjetas pequeñas 18 px, bloques internos 14 px, etiquetas de etapa 7 px, botones y píldoras 999 px.
- **Sombras:** casi ninguna. Las tarjetas se separan por color (crema sobre arena) o por un borde de 1 px `--rule`. La única sombra fuerte es la del teléfono de la portada (`--shadow-float`).
- **Botones:**
  - el principal es naranja con texto en tinta, 700, padding 15 × 28 px;
  - el secundario es una píldora oscura (`bg-ink text-sheet`) o con borde de 1 px.
- **Barra superior:** una píldora flotante crema al 82 % con borde `--rule`, logo a la izquierda, enlaces en tinta y la sección activa en píldora oscura.
- **Firma:** el avión de papel naranja (`PlaneMark`) y la onda naranja gruesa que cruza las tarjetas oscuras y lavanda.

## Componentes en la app

| Componente      | Dónde                                      |
| --------------- | ------------------------------------------ |
| Logo y avión    | `apps/web/components/brand.tsx`            |
| Barra flotante  | `apps/web/components/shell.tsx`            |
| Etapa           | `StageTag` en `apps/web/components/ui.tsx` |
| Botones         | `Button` en `apps/web/components/ui.tsx`   |
| Olas por idioma | `apps/web/components/language-waves.tsx`   |
| Hero oscuro     | `.noche` en `globals.css`                  |
