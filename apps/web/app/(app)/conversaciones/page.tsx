import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Conversaciones' };

// Placeholder: Task 13 builds this page.
export default function Page() {
  return (
    <PageHeader
      title="Conversaciones"
      lead="Lo que Recibido le escribió a cada proveedor y lo que cada uno respondió."
    />
  );
}
