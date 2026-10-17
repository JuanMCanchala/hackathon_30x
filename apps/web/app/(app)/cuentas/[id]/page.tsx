import type { Metadata } from 'next';
import { Receipt } from '@/components/receipt/receipt';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return { title: `Recibo ${(await params).id}` };
}

/** The receipt of one bill: the decision, its proof, its checks and its payment. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Receipt key={id} id={decodeURIComponent(id)} />;
}
