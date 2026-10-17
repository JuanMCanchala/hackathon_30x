import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Proveedores' };

// Placeholder: Task 13 builds this page.
export default function Page() {
  return (
    <PageHeader
      title="Proveedores"
      lead="Contratistas de Altamar Labs, sus contratos, la regla de evidencia de cada uno y lo que se les ha pagado."
    />
  );
}
