# Guion de la demo

Para el video de entrega (3 minutos) y el Demo Day. Todo pasa en la interfaz, sobre los servicios
reales; nada está pregrabado salvo las respuestas del modelo de lenguaje (grabaciones reales de
DeepSeek V4.1 Flash, para que funcione sin claves).

## Antes de grabar

1. Abre la demo en vivo (<!-- DEMO_URL -->https://recibido.vercel.app<!-- /DEMO_URL -->) o
   levántala en local con `pnpm dev` y abre `http://localhost:3000`.
2. Ve a **Recorrido** y pulsa **Reiniciar la demo**: Altamar Labs vuelve al 1 de octubre de 2026,
   con septiembre ya vivido por los servicios reales.
3. Ventana a 1440 px; ten abierta una segunda pestaña en **Cuentas**.
4. Para el momento en vivo con GitHub de verdad: `GITHUB_REPO`, `GITHUB_DEMO_PR` y
   `GITHUB_WEBHOOK_SECRET` configurados y el PR abierto en otra pestaña. Sin ellos, el paso
   "Se fusiona el PR" simula la fusión con el mismo efecto.

## La frase

> **Ningún pago sin prueba de entrega.** Recibido paga una cuenta de servicios solo por el trabajo
> que puede probar entregado, le pide al contratista lo que falta antes de molestar al equipo, y
> concilia cada pago contra el banco.

## Video de 3 minutos

| Tiempo    | Pantalla                                                              | Qué hacer                                                                                                                        | Qué decir                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Recorrido → paso 1, luego **Proveedores**                             | Muestra el paso "El problema" y abre Proveedores: la regla de evidencia de cada contrato.                                        | «Altamar Labs le paga a 14 contratistas en Colombia, México y Brasil. Para mercancía existe el _three-way match_; para servicios no hay nota de recepción: nadie puede probar que el trabajo se entregó, así que toda cuenta pasa por una persona.»                                                                                                                               |
| 0:20–1:10 | Recorrido → **Llegan las cuentas de octubre** → Cuentas               | Pulsa la acción y cambia a Cuentas: las cuentas entran una a una con su barra de prueba y su sello. Abre `oct-03` (Daniela).     | «Recibido lee cada cuenta, la cruza con el contrato y con la evidencia, y decide. Julián cobra 120 h y Toggl tiene 120: **PAGAR**. Daniela cobra 160 h y hay registro de 92: **PAGAR UNA PARTE**, y le escribe por el resto. El Brand kit sin entregable aceptado: **PEDIR AL PROVEEDOR**. Una llave Pix nueva en el correo: **ESCALAR**. La misma cuenta reenviada: **FRENAR**.» |
| 1:10–1:25 | Recorrido → **Daniela responde con la cuenta corregida**              | Pulsa la acción y abre el recibo de Daniela: la conversación y las versiones de la cuenta.                                       | «Daniela responde por su portal con una cuenta corregida por 92 horas. Ya estaban pagadas: el caso se cierra sin una persona y sin pagar dos veces.»                                                                                                                                                                                                                              |
| 1:25–1:40 | Recorrido → **Se fusiona el PR del hito M3** → `oct-05`               | Fusiona el PR en GitHub (o pulsa la acción) y abre la cuenta de Andrés.                                                          | «El hito de Andrés esperaba un pull request abierto. Lo fusionamos… y en segundos la cuenta se paga sola, y el recibo cita el PR.»                                                                                                                                                                                                                                                |
| 1:40–2:05 | Recorrido → **Lee un recibo** → `oct-03`                              | Recorre el recibo: barra de prueba, evidencia con enlaces, los 18 chequeos, lo que leyó el modelo, "Para pagarla", plan de pago. | «Cada decisión tiene su recibo. El modelo de lenguaje solo lee la cuenta y cruza las líneas con el contrato; horas, montos, topes y fechas los calcula código. Pagamos por Bre-B en la fecha de vencimiento y el dinero rinde mientras tanto.»                                                                                                                                    |
| 2:05–2:20 | Recorrido → **Cierre de octubre y extracto de Blinka** → Conciliación | Pulsa la acción y abre Conciliación; señala una diferencia cambiaria, la comisión, el pago devuelto y la línea sin conciliar.    | «Llega el extracto de Blinka: cada línea del banco queda unida a su pago, su cuenta, su contrato y su evidencia, con la diferencia de cambio. Un pago devuelto y un cargo de tarjeta que nada explica quedan marcados.»                                                                                                                                                           |
| 2:20–2:45 | **Resumen** (El marcador)                                             | Muestra autonomía, cero pagos indebidos, casos resueltos por el proveedor, rendimiento y comisiones.                             | «Medido sobre 45 cuentas etiquetadas, con las lecturas reales del modelo: el **80,5 %** de los casos se decide bien sin una persona, contra 0 % hoy; **cero pagos indebidos**, según un verificador independiente; y 9 de esos casos los cerró el proveedor, no el equipo.»                                                                                                       |
| 2:45–3:00 | README → Costo mensual                                                | Muestra la tabla de costo.                                                                                                       | «Leer una cuenta cuesta menos de una décima de centavo de dólar: mil cuentas al mes son USD 0,88 de modelo. Le proponemos a Blinka un piloto con un cliente que pague contratistas en LatAm, sobre su riel real.» Cierre con la frase.                                                                                                                                            |

Si sobra tiempo en el Demo Day:

- **Lina acepta el Brand kit v2** (paso 4): la cuenta de Estudio Ceiba se paga sola citando la
  aceptación.
- **Responder como proveedor**: Conversaciones → _Abrir como proveedor_ en un caso abierto, y
  escribe «cambiamos de banco, paguen a esta cuenta»: el caso se escala, porque el proveedor nunca
  puede cambiar a dónde va el dinero.
- **`oct-19`**: el WhatsApp de «1.200» sin moneda; intenta aprobarla y Recibido no deja: no leyó
  el monto con certeza.

## Preguntas probables del jurado

**¿Y si el modelo lee mal la cuenta?** El modelo nunca decide. Cada campo trae su confianza y
bajo 0,85 se escala. Aun con una lectura totalmente equivocada, el peor caso es pagarle a un
proveedor registrado, a su cuenta registrada, por trabajo que la evidencia prueba, dentro de la
tarifa y del tope. En la evaluación, 15 de 495 campos críticos difieren de la verdad y ninguna
decisión cambió.

**¿Y la inyección de instrucciones en la cuenta?** El documento entra como bloque no confiable; el
modelo la marca y además un escáner determinista la detecta sin depender del modelo. Se escala
(`oct-17`).

**¿Cómo sabe que la evidencia es real?** Solo cuenta lo que viene de los sistemas de registro:
Toggl, GitHub, Linear, la aceptación del PM del cliente, el medidor. Un archivo que manda el
proveedor nunca es evidencia.

**¿Y si el proveedor aprovecha el portal para cambiar la cuenta bancaria?** Todo mensaje del
proveedor pasa por el mismo chequeo de destino: cualquier cuenta distinta o pedido de cambio se
escala. Los datos de pago solo cambian en el registro de proveedores.

**¿No paga dos veces si Daniela manda la cuenta corregida?** La corrección llega por el enlace del
caso, hereda lo ya pagado y solo paga la diferencia. Un verificador independiente lo comprueba
sobre cada pago.

**¿Qué pasa con el 20 % que no se automatiza?** Son los casos que _deben_ llegar a una persona:
una cuenta bancaria nueva, una empresa no registrada, horas sobre el tope, un monto sobre el
límite, un proveedor que no respondió a tiempo. El techo que permiten las etiquetas es 80,5 % y lo
alcanzamos.

**¿Por qué la mediana de pago es de 15 días?** A propósito: pagamos en la fecha de vencimiento para
conservar el rendimiento del fondo, salvo que el descuento por pronto pago valga más.

**¿Cómo se conecta a Blinka de verdad?** El riel es una interfaz (`PaymentRail`) con una
simulación determinista; conectarlo a la API de Blinka es un adaptador. Bre-B, SPEI, Pix y ACH ya
se eligen por moneda.

**¿Qué cuesta operarlo?** USD 0,00088 de modelo por cuenta (medido). Con hosting: unos USD 20 al
mes para un piloto de 200 cuentas y unos USD 64 para 10.000. El costo es el hosting, no la
inferencia.

**¿Cómo lo midieron?** `pnpm eval` corre los servicios reales sobre 45 cuentas etiquetadas, dos
veces (lectura perfecta y lecturas reales grabadas), y bloquea el CI si hay un solo pago indebido.
Las etiquetas nunca se ajustaron al modelo.

**¿En qué se diferencia de un AP automation normal?** Hace el _three-way match_ para servicios,
paga partes, le pregunta primero al proveedor, elige el riel local y el momento del pago, y
concilia hasta la evidencia.
