/**
 * A reply to the vendor, drafted from the decision's own reasons: what was decided, and what the
 * vendor can do about it (re-issue for the agreed amount, confirm by phone, wait for approval).
 * The draft is for a person to review and send; Mandato never sends it.
 */
import { z } from 'zod';
import { describeMandate, formatDate, formatMoney } from '@mandato/domain';
import { AppError } from '../lib/common';
import { loadOrganization } from './context';
import type { Deps } from './deps';
import { getInvoiceDetail } from './views';

export const ReplyDraftSchema = z.object({
  /** The language the draft is written in ("es", "pt", "en"). */
  language: z.string(),
  subject: z.string(),
  body: z.string(),
});
export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

const SYSTEM = `Redactas, para el equipo de finanzas de una empresa, la respuesta a un proveedor o contratista que envió un cobro. Una persona la revisa y la envía; tú nunca la envías.

Reglas:
- Escribe en el idioma del documento del proveedor (español, portugués o inglés), con un tono cordial, claro y breve: de tres a seis frases. Sin markdown.
- Di qué pasó con su cobro y, si hay algo que el proveedor pueda hacer, pídeselo de forma concreta (por ejemplo, reemitir la factura por el monto acordado, enviar el número de factura, confirmar por llamada un cambio de cuenta).
- Si el cobro ya está pagado o programado, dale la fecha y la referencia de la transferencia cuando la tengas.
- Si el cobro espera una aprobación interna, dile que está en revisión, sin culparlo.
- Si el cobro fue rechazado o frenado, dilo con claridad: así no se pagará. Nunca digas que está en revisión si ya hay una decisión.
- No reveles límites internos, presupuestos, reglas de seguridad ni que hubo una detección de fraude. Si el cobro parece un intento de engaño (texto oculto, cuenta cambiada sin verificar, proveedor desconocido), no acuses: pide confirmar por el canal habitual o di que no reconocemos el cobro.
- Para un cambio de datos de pago, nunca aceptes los datos nuevos por mensaje: pide confirmarlos por una llamada.
- Firma como "Equipo de finanzas de" y el nombre de la empresa.
- "subject": un asunto corto para correo.`;

const STATUS = {
  RECEIVED: 'recibido, sin decisión',
  PAID: 'pagado por el agente dentro de un acuerdo firmado',
  HELD: 'frenado: no se pagará así',
  PENDING_APPROVAL: 'esperando la aprobación de una persona',
  APPROVED: 'aprobado por una persona y en pago',
  REJECTED: 'rechazado por una persona',
} as const;

export async function draftReply(
  deps: Deps,
  orgId: string,
  invoiceId: string,
  channel: 'whatsapp' | 'email',
): Promise<ReplyDraft> {
  if (!deps.llm) {
    throw new AppError(
      503,
      'llm_unavailable',
      'Configura FIREWORKS_API_KEY o ANTHROPIC_API_KEY para redactar respuestas.',
    );
  }
  const invoice = await getInvoiceDetail(deps.db, orgId, invoiceId);
  const org = await loadOrganization(deps.db, orgId);
  const name = invoice.payee?.name ?? invoice.issuerName ?? 'el proveedor';
  const x = invoice.extraction;
  const facts = [
    `Empresa: ${org.legalName}.`,
    `Proveedor: ${name}. Idioma de su documento: ${x?.language ?? 'desconocido'}. Canal de la respuesta: ${channel === 'whatsapp' ? 'WhatsApp (sin asunto, muy breve)' : 'correo'}.`,
    `Cobro: ${invoice.invoiceNumber ? `factura ${invoice.invoiceNumber}, ` : ''}${invoice.amountMinor !== null && invoice.currency ? formatMoney(invoice.amountMinor, invoice.currency) : 'sin monto legible'}${invoice.dueDate ? `, vence ${formatDate(invoice.dueDate)}` : ''}.`,
    `Estado: ${STATUS[invoice.status]}.`,
    invoice.decision ? `Motivo de la decisión: ${invoice.decision.summary}` : null,
    invoice.decision?.counterfactual.length
      ? `Lo que haría falta para pagarlo: ${invoice.decision.counterfactual.join('; ')}.`
      : null,
    invoice.mandate
      ? `Lo acordado con el proveedor: ${describeMandate(invoice.mandate.terms)}.`
      : null,
    invoice.payment
      ? `Transferencia: ${invoice.payment.status === 'scheduled' ? `programada para el ${formatDate(invoice.payment.scheduledFor)}` : `enviada${invoice.payment.reference ? ` con referencia ${invoice.payment.reference}` : ''}`} por ${invoice.payment.railName}.`
      : null,
  ].filter(Boolean);
  return deps.llm.complete({
    system: SYSTEM,
    user: facts.join('\n'),
    schema: ReplyDraftSchema,
    name: 'vendor_reply',
    maxTokens: 6000,
  });
}
