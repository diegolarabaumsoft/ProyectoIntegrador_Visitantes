import { AsistenteEnrolamiento } from './asistente-enrolamiento';

export const metadata = { title: 'Enrolar huella' };

export default async function EnrolarHuella({ params }: { params: Promise<{ visitaId: string }> }) {
  const { visitaId } = await params;
  return <AsistenteEnrolamiento visitaId={visitaId} />;
}
