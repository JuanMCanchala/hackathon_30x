# Guion de la demo

Para el video de entrega (3 minutos) y el Demo Day (5 minutos con preguntas). Todo pasa en la
interfaz; nada está pregrabado.

## Antes de empezar

1. Levanta Mandato (`pnpm dev` o `docker compose up --build`) y abre `http://localhost:3000`.
2. En **Recorrido guiado**, pulsa _Reiniciar la demo_: Andes Labs vuelve al 31 de julio de 2026.
3. Actúa como **Laura Méndez** (menú de usuario, arriba a la derecha). Ten a mano el celular para
   abrir el enlace de aprobación de Martín.
4. Ten listo el archivo `vivo-03` (Lexia Legal) desde _Octubre, en vivo_, o súbelo desde el
   botón _Subir factura_.

## La frase

> **Firma acuerdos, no pagos.** Mandato paga solo lo que una persona ya firmó, frena lo que
> huele mal y pregunta todo lo demás, con el motivo exacto. Cada aprobación le enseña un acuerdo
> nuevo; la autonomía sube y los pagos indebidos se quedan en cero.

## Video de 3 minutos

| Tiempo    | Pantalla                                  | Qué decir y qué hacer                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Resumen (vacío)                           | «Cada mes, Laura paga facturas de contratistas y proveedores en cinco países y cuatro monedas. Un agente que paga todo solo es peligroso; uno que pregunta por todo no ahorra nada.»                                                                                              |
| 0:20–0:45 | Acuerdos                                  | «Mandato no recibe permisos de pago: recibe **acuerdos firmados**. A quién, cuánto y cada cuánto. El agente nunca los cambia; solo los propone.»                                                                                                                                  |
| 0:45–1:15 | Recorrido → Procesar agosto               | Las facturas llegan en vivo: PDF, foto de celular, correo, WhatsApp. «Paga solo lo que cabe en lo firmado. El resto pide aprobación, y Martín y Sofía resuelven.»                                                                                                                 |
| 1:15–1:45 | Recibo de `ago-14`                        | La cuenta de cobro reenviada de Valentina: **Frenada**. «Ya estaba pagada. Cada decisión trae su recibo: las 23 verificaciones, qué leyó el modelo y qué haría falta para pagarla. Las reglas son código; el modelo de lenguaje solo lee.»                                        |
| 1:45–2:10 | Recorrido → Procesar septiembre → Resumen | La escalera de confianza: **53 % → 71 %** sin intervención humana y **0 pagos fuera de lo firmado**. «Nada en el motor cambió: las personas firmaron acuerdos que el propio agente propuso.»                                                                                      |
| 2:10–2:40 | Ataca al agente                           | Lanza _Instrucciones escondidas_ y _Cambio de cuenta bancaria_. «Texto blanco de 1 píxel que le ordena al agente aprobar: lo detecta un escáner determinista, aunque el modelo lo pase por alto. Una cuenta nueva por correo: el agente nunca toma datos de pago de una factura.» |
| 2:40–3:00 | Auditoría                                 | _Correr la auditoría_. «Un auditor escrito aparte relee el registro encadenado y certifica cero pagos fuera de las reglas. Si alguien edita un asiento, la cadena se rompe.» Cierre con la frase.                                                                                 |

## Demo Day: 5 minutos

Lo mismo, y además:

1. **Aprobación desde el celular (40 s).** Sube `vivo-03` (Lexia Legal, sin acuerdo): pide
   aprobación. En el recibo, _Aprobar desde el celular_ → _Crear enlace_ para Martín. Ábrelo en
   el celular y aprueba con un toque: el panel se actualiza en vivo. «El enlace está firmado,
   sirve una vez, solo para esa persona, y vence en 24 horas.»
2. **Qué habría pasado (40 s).** En **Reglas**, como Martín, baja el límite por pago a 3.000. Antes
   de guardar, Mandato reprocesa todo el historial y muestra cuántas facturas se habrían decidido
   distinto, y cuáles. Descarta el cambio.
3. **Agentes conectados (20 s).** Otro agente de IA pide pagos por MCP con un permiso más estrecho
   (solo software, hasta USD 1.000). «Pasa por las mismas 23 reglas. No hay herramienta para
   aprobar ni para firmar.»

## Preguntas probables

**¿Qué pasa si Claude lee mal una factura?** El modelo no decide. Si lee un monto distinto, el
pago no cabe en el acuerdo; si lee otra cuenta, no coincide con la registrada; si duda, su
confianza queda bajo el umbral. En todos los casos la factura va a una persona. Lo peor que un
documento falso o manipulado puede lograr es que se le pague a un beneficiario que la empresa ya
paga, un monto que la empresa ya firmó.

**¿Y la inyección de instrucciones?** Doble barrera: el lector marca el texto dirigido a un
sistema automático, y un escáner determinista revisa el texto del PDF, incluido el invisible.
Cualquiera de las dos escala. Aunque ambas fallaran, el motor no obedece instrucciones: evalúa
reglas.

**¿Por qué no dejar que el LLM decida con buenas instrucciones?** Porque no se puede auditar ni
probar. Aquí cada decisión es una función pura: misma entrada, mismo recibo. Las pruebas basadas en
propiedades generan miles de facturas y comprueban que ninguna se paga fuera de las reglas.

**¿Cómo se conecta con Blinka?** Mandato decide; no mueve dinero. Las facturas `PAID` y
`APPROVED` salen por un puerto `PaymentRail` hacia la API de pagos (Bre-B, SPEI, Pix, ACH). Las
cuentas destino vienen del registro, no de las facturas.

**¿Escala?** El motor decide en menos de un milisegundo por factura; el cuello de botella es la lectura,
que corre en paralelo y fuera del candado por organización. Las decisiones de una misma empresa se
serializan para que dos facturas simultáneas no se coman el mismo presupuesto.

**¿Cómo saben que funciona?** `pnpm eval` corre el sistema completo sobre 49 facturas etiquetadas,
incluidos 11 ataques: 100 % de decisiones correctas, 0 pagos indebidos y 0 violaciones del auditor. La CI
falla si un solo pago indebido aparece. Ver [EVALUATION.md](EVALUATION.md).
