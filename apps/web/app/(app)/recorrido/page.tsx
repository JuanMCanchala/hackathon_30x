import type { Metadata } from 'next';
import { GuidedTour } from '@/components/tour/tour';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Recorrido' };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Recorrido"
        lead="La demo de tres minutos, paso a paso. Cada botón se habilita cuando le toca; el enlace de cada paso lleva a la pantalla donde se ve lo que pasó."
      />
      <GuidedTour />
    </>
  );
}
