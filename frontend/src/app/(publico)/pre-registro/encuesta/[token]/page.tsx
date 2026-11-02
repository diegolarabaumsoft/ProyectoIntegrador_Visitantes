import { EncuestaSatisfaccion } from './encuesta-satisfaccion';

export const metadata = { title: 'Encuesta de satisfacción' };

export default async function PaginaEncuesta({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EncuestaSatisfaccion token={token} />;
}
