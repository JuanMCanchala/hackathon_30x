/**
 * MCP tools for external agents (ADR-0013). Agents can *request* payments and read their status,
 * the budget and the registered payees. There is deliberately no tool to approve, sign or change
 * rules: those belong to people.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MandatoError, type MandatoClient } from './client';

const PAYOUT_METHODS = ['bre_b', 'spei', 'pix', 'ach', 'wire', 'card', 'other'] as const;
const CATEGORIES = ['contractor', 'software', 'services', 'facilities', 'travel', 'other'] as const;

function text(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function failure(error: unknown) {
  const message =
    error instanceof MandatoError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  return { ...text(`Mandato no pudo procesar la solicitud: ${message}`), isError: true };
}

interface PaymentView {
  id: string;
  referencia: string;
  decision: string;
  estado_legible: string;
  resumen: string;
  que_falto: string[];
  aprobaciones_requeridas: number;
  ver_en: string;
}

function describe(view: PaymentView): string {
  const lines = [`${view.referencia}: ${view.estado_legible}.`, view.resumen];
  if (view.que_falto.length) {
    lines.push('', 'Se habría pagado sola si:', ...view.que_falto.map((r) => `- ${r}`));
  }
  if (view.decision === 'ESCALATE') {
    lines.push(
      '',
      `Necesita ${view.aprobaciones_requeridas === 2 ? 'dos aprobaciones de personas distintas' : 'la aprobación de una persona'}. No la apruebes ni insistas: informa a tu usuario.`,
    );
  }
  lines.push('', `Recibo completo: ${view.ver_en}`, `id: ${view.id}`);
  return lines.join('\n');
}

export function createMandatoServer(client: MandatoClient): McpServer {
  const server = new McpServer({ name: 'mandato', version: '1.0.0' });

  server.registerTool(
    'solicitar_pago',
    {
      title: 'Solicitar un pago',
      description:
        'Pide a Mandato pagar una factura. Mandato aplica las reglas de la empresa y responde PAY (pagada), HOLD (frenada) o ESCALATE (una persona debe aprobarla), con la explicación. Nunca promete el pago antes de la respuesta.',
      inputSchema: {
        beneficiario: z.object({
          nombre: z.string().describe('Nombre o razón social de quien cobra'),
          id_fiscal: z
            .string()
            .nullable()
            .optional()
            .describe('NIT, RFC, CPF, EIN… tal como aparece en la factura'),
          pais: z.string().length(2).nullable().optional().describe('País ISO 3166-1 alfa-2'),
        }),
        numero_factura: z.string(),
        fecha_emision: z.string().describe('YYYY-MM-DD'),
        fecha_vencimiento: z.string().nullable().optional().describe('YYYY-MM-DD'),
        periodo_servicio: z.string().nullable().optional().describe('YYYY-MM'),
        moneda: z.string().length(3).describe('ISO 4217, p. ej. USD, COP, MXN, BRL'),
        monto: z.string().describe('Decimal canónico sin separadores de miles: "1200.00"'),
        concepto: z.string(),
        destino: z
          .object({ metodo: z.enum(PAYOUT_METHODS), valor: z.string() })
          .nullable()
          .optional()
          .describe('Datos de pago que trae la factura; Mandato solo paga a destinos registrados'),
        categoria: z.enum(CATEGORIES).nullable().optional(),
      },
    },
    async (args) => {
      try {
        return text(describe((await client.requestPayment(args)) as unknown as PaymentView));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'consultar_solicitud',
    {
      title: 'Consultar una solicitud de pago',
      description: 'Estado actual de una solicitud propia: si una persona ya la aprobó o rechazó.',
      inputSchema: { id: z.string().describe('id devuelto por solicitar_pago') },
    },
    async ({ id }) => {
      try {
        return text(describe((await client.getPaymentRequest(id)) as unknown as PaymentView));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'ver_presupuesto',
    {
      title: 'Ver presupuesto y permiso',
      description:
        'Presupuesto disponible del mes, límite por pago y lo que este agente puede solicitar.',
      inputSchema: {},
    },
    async () => {
      try {
        return text(await client.budget());
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'listar_beneficiarios',
    {
      title: 'Listar beneficiarios registrados',
      description: 'Beneficiarios a los que la empresa paga, con sus datos de pago enmascarados.',
      inputSchema: {},
    },
    async () => {
      try {
        return text(await client.payees());
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
