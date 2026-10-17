/**
 * ADR-0011: concurrent decisions must never commit more than the month's budget. With the
 * organization lock, a burst of bills that together exceed the budget pays only what fits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { INITIAL_POLICY, ORGANIZATION } from '@mandato/dataset';
import type { Container } from '../src/container';
import { invoices, policies } from '../src/db/schema';
import { auditLedger } from '@mandato/domain';
import { sha256 } from '../src/lib/common';
import { requestPayment, authenticateAgent } from '../src/services/agents';
import { readLedger } from '../src/services/ledger';
import { demoContainer } from './helpers';

let container: Container;

beforeAll(async () => {
  container = await demoContainer({ now: '2026-08-04T15:00:00Z' });
  // A tiny budget and an agent allowed to pay contractors make the race easy to provoke.
  await container.deps.db
    .update(policies)
    .set({ terms: { ...INITIAL_POLICY, monthlyBudgetUsdCents: 1_000_000 } })
    .where(eq(policies.orgId, ORGANIZATION.id));
});
afterAll(() => container.database.close());

describe('serialized decisions', () => {
  it('never exceeds the budget under a burst of concurrent requests', async () => {
    await container.deps.db.execute(
      sql`update agents set scope = ${JSON.stringify({ categories: ['contractor', 'software', 'services'], maxPerRequestUsdCents: 2_000_000 })}::jsonb`,
    );
    const agent = await authenticateAgent(container.deps, 'Bearer mnd_demo_agente_compras_2026');
    const requests = ['valentina', 'mateo', 'camila', 'tomas', 'sebastian'].map((who, i) => {
      const bills: Record<string, object> = {
        valentina: {
          nombre: 'Valentina Ríos Mejía',
          id: 'CC 1020304050',
          moneda: 'COP',
          monto: '14000000.00',
          destino: { metodo: 'bre_b', valor: '@valrios' },
        },
        mateo: {
          nombre: 'Mateo Herrera Garza',
          id: 'HEGM900101AB1',
          moneda: 'MXN',
          monto: '72000.00',
          destino: { metodo: 'spei', valor: '012180001234567891' },
        },
        camila: {
          nombre: 'Camila Souza Lima',
          id: 'CPF 111.444.777-35',
          moneda: 'BRL',
          monto: '16200.00',
          destino: { metodo: 'pix', valor: 'camila.souza@exemplo.com.br' },
        },
        tomas: {
          nombre: 'Tomás Aguirre Paz',
          id: 'CUIT 20-31234567-8',
          moneda: 'USD',
          monto: '4200.00',
          destino: { metodo: 'wire', valor: '000123456789' },
        },
        sebastian: {
          nombre: 'Sebastián Prada Duque',
          id: 'CC 80.123.456',
          moneda: 'COP',
          monto: '10000000.00',
          destino: { metodo: 'bre_b', valor: '@sebaspd' },
        },
      };
      const b = bills[who] as {
        nombre: string;
        id: string;
        moneda: string;
        monto: string;
        destino: object;
      };
      return requestPayment(container.deps, agent, {
        beneficiario: { nombre: b.nombre, id_fiscal: b.id },
        numero_factura: `RACE-${i}`,
        fecha_emision: '2026-08-03',
        moneda: b.moneda,
        monto: b.monto,
        concepto: 'Servicios de agosto',
        destino: b.destino,
        categoria: 'contractor',
        periodo_servicio: '2026-08',
      });
    });
    const views = await Promise.all(requests);
    expect(views.some((v) => v.decision === 'PAY')).toBe(true);
    expect(views.some((v) => v.decision === 'ESCALATE')).toBe(true);

    const [row] = await container.deps.db
      .select({ total: sql<string>`coalesce(sum(${invoices.usdCents}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.orgId, ORGANIZATION.id), inArray(invoices.status, ['PAID'])));
    expect(Number(row?.total)).toBeLessThanOrEqual(1_000_000);

    const report = auditLedger(await readLedger(container.deps.db, ORGANIZATION.id), sha256);
    expect(report.findings).toEqual([]);
  });
});
