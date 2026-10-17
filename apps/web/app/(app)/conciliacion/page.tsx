import type { Metadata } from 'next';
import { ReconciliationView } from '@/components/recon/recon';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Conciliación' };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Conciliación"
        lead="El extracto simulado de Blinka, línea por línea: cada débito unido a su pago, su cuenta, su contrato y la evidencia que lo justificó, con la diferencia de cambio y las comisiones."
      />
      <ReconciliationView />
    </>
  );
}
