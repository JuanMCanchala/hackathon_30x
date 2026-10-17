import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Conciliación' };

// Placeholder: Task 13 builds this page.
export default function Page() {
  return (
    <PageHeader
      title="Conciliación"
      lead="Cada línea del extracto de Blinka enlazada con su pago, su cuenta, su contrato y su evidencia."
    />
  );
}
