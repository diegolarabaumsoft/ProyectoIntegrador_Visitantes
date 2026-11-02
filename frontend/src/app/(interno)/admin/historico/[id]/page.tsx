import { DetalleVisita } from './detalle-visita';

export const metadata = { title: 'Detalle de visita' };

export default async function PaginaDetalleVisita({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleVisita id={id} />;
}
