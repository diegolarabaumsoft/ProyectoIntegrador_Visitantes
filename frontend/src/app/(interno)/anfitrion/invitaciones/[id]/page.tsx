import { DetalleInvitacion } from './detalle-invitacion';

export const metadata = { title: 'Detalle de invitación' };

export default async function PaginaDetalleInvitacion({ params }: PageProps<'/anfitrion/invitaciones/[id]'>) {
  const { id } = await params;
  return <DetalleInvitacion id={id} />;
}
