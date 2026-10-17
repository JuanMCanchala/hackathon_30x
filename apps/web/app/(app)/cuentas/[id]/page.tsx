import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Cuenta' };

// Placeholder: Task 13 builds the receipt.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageHeader
      title={`Cuenta ${id}`}
      lead="El recibo de la decisión: la prueba, las reglas y el pago."
    />
  );
}
