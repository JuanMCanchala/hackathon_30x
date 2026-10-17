import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Recorrido' };

// Placeholder: Task 13 builds this page.
export default function Page() {
  return (
    <PageHeader
      title="Recorrido"
      lead="El mes de octubre de Altamar Labs, paso a paso, con un reinicio de un clic."
    />
  );
}
