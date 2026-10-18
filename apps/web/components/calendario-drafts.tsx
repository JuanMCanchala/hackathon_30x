/**
 * «Borradores esperando aprobación»: the topics the team marked «Sirve» in Elegir that still have
 * no piece on the calendar. A table on a wide screen, a card per topic below it.
 */
import clsx from 'clsx';
import Link from 'next/link';
import { FormatChip, FormatTile, linkBtn } from './calendario-format';
import { Card, StageChip, table } from './kit';
import { Skeleton, fmtGrowth } from './ui';
import type { RadarTopic } from '@/lib/types';

export function WaitingDrafts({
  topics,
  loading,
  team,
}: {
  topics: RadarTopic[];
  loading: boolean;
  /** «Equipo 30X». */
  team: string;
}) {
  return (
    <Card
      title="Borradores esperando aprobación"
      action={
        topics.length > 0 ? (
          <span className="hidden text-[0.84rem] whitespace-nowrap text-ink-3 tabular-nums sm:inline">
            {topics.length === 1 ? '1 tema' : `${topics.length} temas`}
          </span>
        ) : null
      }
    >
      {loading ? (
        <Skeleton className="h-28" />
      ) : topics.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-[10px] bg-sheet-2 px-4 py-5 text-[0.92rem] text-ink-2">
          <p>
            No hay temas esperando. Los que el equipo marque «Sirve» en Elegir aparecen aquí hasta
            que su pieza quede aprobada.
          </p>
          <Link href="/elegir" className={linkBtn.outline}>
            Ir a Elegir
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:hidden">
            {topics.map((t) => (
              <li
                key={t.id}
                className="grid content-between gap-3 rounded-[12px] border border-rule bg-sheet p-3.5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <FormatTile kind="pendiente" className="size-10" />
                  <div className="grid min-w-0 gap-1.5">
                    <p className="font-[700] break-words text-ink">{t.name}</p>
                    <p className="flex flex-wrap items-center gap-2 text-[0.84rem] text-ink-2 tabular-nums">
                      <StageChip stage={t.stage} />
                      {fmtGrowth(t.growthPct)}
                      <FormatChip kind="pendiente" size="sm" />
                    </p>
                    <p className="text-[0.82rem] text-ink-3">{team}</p>
                  </div>
                </div>
                <Link href={`/tema/${t.id}/contar`} className={clsx(linkBtn.outline, 'w-full')}>
                  Revisar borrador
                </Link>
              </li>
            ))}
          </ul>
          <div className={clsx(table.wrap, 'hidden xl:block')}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Pieza</th>
                  <th className={table.th}>Formato</th>
                  <th className={table.th}>Tema</th>
                  <th className={table.th}>Responsable</th>
                  <th className={table.th}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.id}>
                    <td className={table.td}>
                      <span className="flex min-w-0 items-center gap-3">
                        <FormatTile kind="pendiente" className="size-10" />
                        <span className="font-[500] break-words">{t.name}</span>
                      </span>
                    </td>
                    <td className={table.td}>
                      <FormatChip kind="pendiente" />
                    </td>
                    <td className={table.td}>
                      <span className="flex flex-wrap items-center gap-2">
                        <StageChip stage={t.stage} />
                        <span className="text-[0.86rem] text-ink-2 tabular-nums">
                          {fmtGrowth(t.growthPct)}
                        </span>
                      </span>
                    </td>
                    <td className={clsx(table.td, 'whitespace-nowrap')}>{team}</td>
                    <td className={clsx(table.td, 'text-right')}>
                      <Link href={`/tema/${t.id}/contar`} className={linkBtn.outline}>
                        Revisar borrador
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
