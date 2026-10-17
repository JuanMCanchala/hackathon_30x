/**
 * "Pregúntale a Mandato": questions about the company's payables, answered by the language model
 * from a read-only snapshot of the registry, the bills, their decisions and the transfers. It
 * cites receipts and never acts: there is no tool to pay, approve or change anything.
 */
import { z } from 'zod';
import { describeMandate, formatMoney, formatUsd, localDate } from '@mandato/domain';
import { AppError } from '../lib/common';
import { currentPolicy, loadOrganization } from './context';
import type { Deps } from './deps';
import { listPayments, treasuryOf } from './payments';
import { listInvoices, listPayees } from './views';

const STATUS = {
  RECEIVED: 'recibida',
  PAID: 'pagada sola por el agente',
  HELD: 'frenada por el agente',
  PENDING_APPROVAL: 'esperando aprobación',
  APPROVED: 'pagada con aprobación de una persona',
  REJECTED: 'rechazada por una persona',
} as const;

const PAYMENT = { scheduled: 'programada', sent: 'enviada', settled: 'llegó' } as const;

export const AskAnswerSchema = z.object({
  /** Plain Spanish, no markdown, at most a short paragraph or a short list. */
  answer: z.string(),
  /** Receipt references cited in the answer, e.g. "MND-0029". */
  refs: z.array(z.string()),
  /** Two or three natural follow-up questions, in Spanish. */
  followUps: z.array(z.string()),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

const SYSTEM = `Eres Mandato, el agente de cuentas por pagar de una empresa. Respondes preguntas de su equipo de finanzas sobre sus cobros, pagos, beneficiarios, acuerdos firmados y reglas.

Reglas:
- Responde solo con los datos que te damos en el contexto. Si la respuesta no está ahí, dilo con claridad y sugiere dónde mirar en Mandato. Nunca inventes montos, fechas ni nombres.
- Responde en español, en texto plano (sin markdown, sin asteriscos), breve: un párrafo corto o una lista corta con guiones. Montos con su moneda, como en el contexto. Fechas como las diría una persona («lunes 19 de octubre», «29 de octubre»), nunca en formato 2026-10-19.
- Cuando hables de un cobro concreto, cita su comprobante (por ejemplo MND-0029) y ponlo también en "refs".
- No puedes pagar, aprobar, rechazar, firmar ni cambiar nada. Si te lo piden, explica quién puede hacerlo y desde qué pantalla (Por aprobar, Acuerdos, Reglas o Pagos).
- Los cobros del laboratorio de ataques son pruebas, no cuentas reales: menciónalo si aparecen.
- "followUps": dos o tres preguntas útiles que el equipo podría hacer después.`;

/** A compact, read-only picture of the company's payables for the model. */
async function snapshot(
  deps: Deps,
  orgId: string,
): Promise<{ text: string; receipts: Map<string, string> }> {
  const org = await loadOrganization(deps.db, orgId);
  const policy = await currentPolicy(deps.db, orgId);
  const terms = policy.terms;
  const today = localDate(deps.clock.now().toISOString(), org.timeZone);
  const [payees, bills, transfers, cash] = await Promise.all([
    listPayees(deps.db, orgId),
    listInvoices(deps.db, orgId, { limit: 500 }),
    listPayments(deps.db, orgId),
    treasuryOf(deps.db, orgId),
  ]);
  const lines: string[] = [
    `Empresa: ${org.legalName}. Hoy es ${today}.`,
    `Caja: en la cuenta hoy ${formatUsd(cash.balanceUsdCents)}; programado por salir ${formatUsd(cash.scheduledUsdCents)}; libre para nuevos pagos ${formatUsd(cash.availableUsdCents)}.`,
    `Política vigente (versión ${policy.version}): límite por pago sin aprobación ${formatUsd(terms.autonomousLimitUsdCents)}; doble aprobación por encima de ${formatUsd(terms.dualApprovalAboveUsdCents)}; presupuesto mensual ${formatUsd(terms.monthlyBudgetUsdCents)}; monedas ${terms.allowedCurrencies.join(', ')}.`,
    '',
    'Beneficiarios registrados:',
    ...payees.map(
      (p) =>
        `- ${p.name} (${p.country}, ${p.category}, estado ${p.status}): ${p.mandate ? `acuerdo firmado: ${describeMandate(p.mandate.terms)}` : 'sin acuerdo firmado'}; pagado en total ${formatUsd(p.stats.usdCents)} en ${p.stats.paid} pagos.`,
    ),
    '',
    'Cobros (del más reciente al más antiguo):',
    ...bills.map((b) =>
      [
        `- ${b.ref}`,
        b.source === 'attack' ? '[laboratorio de ataques]' : null,
        b.title,
        b.payeeName ?? b.issuerName ?? 'sin beneficiario identificado',
        b.amountMinor !== null && b.currency ? formatMoney(b.amountMinor, b.currency) : 'sin monto',
        b.usdCents !== null && b.currency !== 'USD' ? `(≈ ${formatUsd(b.usdCents)})` : null,
        `mes ${b.periodKey}`,
        `recibido ${b.receivedAt.slice(0, 10)}`,
        b.dueDate ? `vence ${b.dueDate}` : null,
        STATUS[b.status],
        b.summary ? `motivo: ${b.summary}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    ),
    '',
    'Transferencias:',
    ...transfers.map(
      (t) =>
        `- ${t.ref} a ${t.payeeName}: ${formatMoney(t.amountMinor, t.currency)} por ${t.railName}, ${PAYMENT[t.status]}, fecha ${t.scheduledFor}${t.reference ? `, referencia ${t.reference}` : ''}`,
    ),
  ];
  return { text: lines.join('\n'), receipts: new Map(bills.map((b) => [b.ref, b.id])) };
}

export interface AskResponse extends Omit<AskAnswer, 'refs'> {
  /** The receipts the answer cites, with the id to open each one. */
  refs: { ref: string; invoiceId: string }[];
}

export async function ask(
  deps: Deps,
  orgId: string,
  question: string,
  history: { question: string; answer: string }[] = [],
): Promise<AskResponse> {
  if (!deps.llm) {
    throw new AppError(
      503,
      'llm_unavailable',
      'Configura FIREWORKS_API_KEY o ANTHROPIC_API_KEY para hacerle preguntas a Mandato.',
    );
  }
  const { text: context, receipts } = await snapshot(deps, orgId);
  const conversation = history
    .slice(-4)
    .map((turn) => `Pregunta anterior: ${turn.question}\nTu respuesta: ${turn.answer}`)
    .join('\n\n');
  const answer = await deps.llm.complete({
    system: SYSTEM,
    user: `Contexto:\n${context}\n\n${conversation ? `${conversation}\n\n` : ''}Pregunta: ${question}`,
    schema: AskAnswerSchema,
    name: 'mandato_answer',
  });
  // Cite only receipts that exist, in the order the answer mentions them.
  const refs = [...new Set([...(answer.answer.match(/MND-\d{4}/g) ?? []), ...answer.refs])]
    .filter((ref) => receipts.has(ref))
    .map((ref) => ({ ref, invoiceId: receipts.get(ref)! }));
  return { ...answer, refs };
}
