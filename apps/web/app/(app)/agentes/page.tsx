'use client';

import { Bot } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_LABELS, formatUsd } from '@mandato/domain';
import { InvoiceRows } from '@/components/invoice-list';
import { Button, PageHeader, Skeleton } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import type { AgentView, InvoiceListItem } from '@/lib/types';

const TOOLS = [
  {
    name: 'solicitar_pago',
    text: 'Pide pagar una factura. Recibe la decisión, la explicación y lo que faltó.',
  },
  { name: 'consultar_solicitud', text: 'Revisa si una persona ya aprobó o rechazó su solicitud.' },
  {
    name: 'ver_presupuesto',
    text: 'Consulta el presupuesto disponible del mes y su propio permiso.',
  },
  {
    name: 'listar_beneficiarios',
    text: 'Lista a quién paga la empresa, con los datos de pago enmascarados.',
  },
];

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-sheet-2">
      <div className="flex items-center justify-between border-b border-rule bg-sheet-2 px-3.5 py-2">
        <p className="text-sm font-[600] text-ink">{title}</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            toast('Copiado');
          }}
        >
          Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto bg-sheet px-3.5 py-3 font-mono text-xs leading-relaxed text-ink">
        {code}
      </pre>
    </div>
  );
}

export default function AgentesPage() {
  const { data: agents } = useApi<AgentView[]>('/api/v1/agents');
  const { data: requests } = useApi<InvoiceListItem[]>('/api/v1/invoices?source=agent');

  const claudeCode = `claude mcp add mandato \\
  --env MANDATO_API_URL=http://localhost:4000 \\
  --env MANDATO_AGENT_KEY=mnd_demo_agente_compras_2026 \\
  -- pnpm --dir apps/mcp dev`;
  const desktop = JSON.stringify(
    {
      mcpServers: {
        mandato: {
          command: 'node',
          args: ['apps/mcp/dist/index.js'],
          env: {
            MANDATO_API_URL: 'http://localhost:4000',
            MANDATO_AGENT_KEY: 'mnd_demo_agente_compras_2026',
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Agentes conectados"
        lead="Las empresas ya tienen sus propios agentes y quieren que paguen. Aquí se conectan por MCP: pueden pedir pagos, pero pasan por las mismas reglas, reciben el mismo comprobante y nunca aprueban ni firman nada."
      />

      <section className="grid gap-5 lg:grid-cols-2">
        {agents === undefined ? (
          <Skeleton className="h-48" />
        ) : (
          agents.map((agent) => (
            <article key={agent.id} className="sheet grid gap-3 p-5">
              <p className="flex items-center gap-2 text-sm text-ink-2">
                <Bot className="size-4 text-brand" aria-hidden /> Agente externo,{' '}
                {agent.status === 'active' ? 'activo' : 'revocado'}
              </p>
              <h2 className="t-h3 text-ink">{agent.name}</h2>
              <p className="text-ink-2">{agent.description}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-3">Puede pedir</dt>
                <dd className="text-ink">
                  {agent.scope.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ')}
                </dd>
                <dt className="text-ink-3">Hasta</dt>
                <dd className="text-ink">
                  {formatUsd(agent.scope.maxPerRequestUsdCents)} por solicitud
                </dd>
                <dt className="text-ink-3">Fuera de eso</dt>
                <dd className="text-ink">el pago se frena, aunque el beneficiario tenga acuerdo</dd>
              </dl>
            </article>
          ))
        )}
        <article className="sheet grid content-start gap-3 p-5">
          <h2 className="t-h3 text-ink">Herramientas que ve el agente</h2>
          <ul className="grid gap-2.5">
            {TOOLS.map((t) => (
              <li key={t.name}>
                <p className="font-mono text-sm text-ink">{t.name}</p>
                <p className="text-sm text-ink-2">{t.text}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-3">
            No existe ninguna herramienta para aprobar, firmar ni cambiar reglas.
          </p>
        </article>
      </section>

      <section className="grid gap-4">
        <h2 className="t-h2 text-ink">Conectar un agente</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Snippet title="Claude Code" code={claudeCode} />
          <Snippet title="Claude Desktop (claude_desktop_config.json)" code={desktop} />
        </div>
        <p className="text-sm text-ink-3">
          La clave de demo solo funciona con el modo demo. La API documentada está en{' '}
          <a href="/docs" className="text-brand hover:underline">
            /docs
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="t-h2 mb-4 text-ink">Solicitudes de agentes</h2>
        {requests && requests.length > 0 ? (
          <div className="sheet overflow-hidden">
            <InvoiceRows items={requests} />
          </div>
        ) : (
          <p className="text-ink-2">
            Todavía no hay solicitudes. Lanza el ataque «Un agente pide más de lo que puede» o
            conecta uno.
          </p>
        )}
      </section>
    </div>
  );
}
