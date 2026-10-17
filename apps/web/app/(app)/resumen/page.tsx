import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Resumen' };

// Placeholder: Task 13 builds this page.
export default function Page() {
  return (
    <PageHeader
      title="Resumen"
      lead="El marcador de Altamar Labs: cuántas cuentas decidió Recibido sin una persona, cuánto probó la evidencia y qué sigue abierto."
    />
  );
}
