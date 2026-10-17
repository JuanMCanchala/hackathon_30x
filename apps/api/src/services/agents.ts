/**
 * Gateway for external agents (ADR-0013): scoped API keys, payment *requests* only. Agents get
 * the same rules and the same receipts as everyone else, and can never approve or sign.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrencyCode,
  DecimalString,
  IsoDate,
  maskDestination,
  PayeeCategory,
  PayoutMethod,
  periodKeyOf,
  type ExtractedInvoice,
  type PolicyTerms,
} from '@mandato/domain';
import { agents, invoices } from '../db/schema';
import { AppError, notFound, sha256 } from '../lib/common';
import { committedUsdCents, currentPolicy, loadOrganization, loadPayees } from './context';
import type { Deps } from './deps';
import { ingestInvoice } from './invoices';
import { getInvoiceDetail } from './views';

export const AgentPaymentRequestSchema = z.object({
  beneficiario: z.object({
    nombre: z.string().min(1).describe('Nombre o razón social de quien cobra'),
    id_fiscal: z.string().nullable().optional().describe('NIT, RFC, CPF, EIN… tal como aparece'),
    pais: z.string().length(2).nullable().optional().describe('País ISO 3166-1 alfa-2'),
  }),
  numero_factura: z.string().min(1),
  fecha_emision: IsoDate,
  fecha_vencimiento: IsoDate.nullable().optional(),
  periodo_servicio: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .optional(),
  moneda: CurrencyCode,
  monto: DecimalString.describe('Decimal canónico: "1200.00"'),
  concepto: z.string().min(1),
  destino: z
    .object({ metodo: PayoutMethod, valor: z.string().min(1) })
    .nullable()
    .optional(),
  categoria: PayeeCategory.nullable().optional(),
});
export type AgentPaymentRequest = z.infer<typeof AgentPaymentRequestSchema>;

export async function authenticateAgent(deps: Deps, bearer: string | undefined) {
  const key = bearer?.replace(/^Bearer\s+/i, '').trim();
  if (!key) throw new AppError(401, 'unauthorized', 'Falta la API key del agente.');
  const [agent] = await deps.db
    .select()
    .from(agents)
    .where(eq(agents.keyHash, sha256(key)));
  if (!agent || agent.status !== 'active') {
    throw new AppError(401, 'unauthorized', 'API key de agente inválida o revocada.');
  }
  return agent;
}

type AgentRow = Awaited<ReturnType<typeof authenticateAgent>>;

export function extractionFromRequest(request: AgentPaymentRequest): ExtractedInvoice {
  return {
    documentType: 'invoice',
    language: 'es',
    issuer: {
      name: request.beneficiario.nombre,
      taxId: request.beneficiario.id_fiscal ?? null,
      country: request.beneficiario.pais ?? null,
      email: null,
    },
    billTo: { name: null, taxId: null },
    invoiceNumber: request.numero_factura,
    issueDate: request.fecha_emision,
    dueDate: request.fecha_vencimiento ?? null,
    servicePeriod: request.periodo_servicio ?? null,
    currency: request.moneda,
    total: request.monto,
    subtotal: null,
    amountInWords: null,
    amountInWordsValue: null,
    lineItems: [
      {
        description: request.concepto,
        quantity: '1',
        unitPrice: request.monto,
        amount: request.monto,
      },
    ],
    taxes: [],
    payout: {
      method: request.destino?.metodo ?? null,
      destination: request.destino?.valor ?? null,
      bankName: null,
      accountHolder: null,
    },
    category: request.categoria ?? null,
    description: request.concepto,
    agentInstructions: { detected: false, quote: null },
    confidence: {
      issuer: 1,
      invoiceNumber: 1,
      issueDate: 1,
      dueDate: 1,
      currency: 1,
      total: 1,
      payout: 1,
    },
    warnings: [],
  };
}

export async function requestPayment(
  deps: Deps,
  agent: AgentRow,
  payload: unknown,
  /** Demo only: a simulated instant, and the attack-lab id that tags test traffic. */
  options: { at?: string; datasetId?: string } = {},
) {
  const request = AgentPaymentRequestSchema.parse(payload);
  const result = await ingestInvoice(deps, {
    orgId: agent.orgId,
    source: 'agent',
    requester: { kind: 'agent', agentId: agent.id, name: agent.name, scope: agent.scope },
    structured: extractionFromRequest(request),
    title: `${request.beneficiario.nombre} · ${request.numero_factura} (solicitado por ${agent.name})`,
    at: options.at,
    datasetId: options.datasetId ?? null,
  });
  return paymentRequestView(deps, agent, result.invoiceId);
}

export async function paymentRequestView(deps: Deps, agent: AgentRow, invoiceId: string) {
  const [row] = await deps.db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, agent.orgId)));
  if (!row || row.requester.kind !== 'agent' || row.requester.agentId !== agent.id) {
    throw notFound('La solicitud');
  }
  const detail = await getInvoiceDetail(deps.db, agent.orgId, invoiceId);
  const labels: Record<string, string> = {
    PAID: 'pagada por el agente',
    HELD: 'frenada',
    PENDING_APPROVAL: 'pendiente de aprobación humana',
    APPROVED: 'aprobada por una persona',
    REJECTED: 'rechazada por una persona',
  };
  return {
    id: detail.id,
    referencia: detail.ref,
    estado: detail.status,
    estado_legible: labels[detail.status] ?? detail.status,
    decision: detail.outcome,
    resumen: detail.decision?.summary ?? '',
    que_falto: detail.decision?.counterfactual ?? [],
    reglas: (detail.decision?.results ?? []).map((r) => ({
      regla: r.title,
      resultado: r.status === 'pass' ? 'cumple' : r.status === 'fail' ? 'no cumple' : 'no aplica',
      detalle: r.detail,
    })),
    aprobaciones_requeridas: detail.decision?.approvalsRequired ?? 0,
    ver_en: `${deps.config.PUBLIC_WEB_URL}/facturas/${detail.id}`,
  };
}

export async function agentBudget(deps: Deps, agent: AgentRow) {
  const org = await loadOrganization(deps.db, agent.orgId);
  const policy = await currentPolicy(deps.db, agent.orgId);
  const terms = policy.terms as PolicyTerms;
  const period = periodKeyOf(deps.clock.now().toISOString(), org.timeZone);
  const committed = await committedUsdCents(deps.db, agent.orgId, period);
  return {
    periodo: period,
    presupuesto_mensual_usd: terms.monthlyBudgetUsdCents / 100,
    comprometido_usd: committed / 100,
    disponible_usd: Math.max(0, terms.monthlyBudgetUsdCents - committed) / 100,
    limite_por_pago_sin_aprobacion_usd: terms.autonomousLimitUsdCents / 100,
    permiso_del_agente: {
      categorias: agent.scope.categories,
      maximo_por_solicitud_usd: agent.scope.maxPerRequestUsdCents / 100,
    },
  };
}

export async function agentPayees(deps: Deps, agent: AgentRow) {
  const list = await loadPayees(deps.db, agent.orgId);
  return list
    .filter((p) => p.status === 'active')
    .map((p) => ({
      nombre: p.name,
      razon_social: p.legalName,
      pais: p.country,
      categoria: p.category,
      moneda: p.currency,
      destino: `${p.destination.method} ${maskDestination(p.destination.value)}`,
    }));
}
