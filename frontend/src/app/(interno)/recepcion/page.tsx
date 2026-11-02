import { ConsolaRecepcion } from './consola-recepcion';

export const metadata = { title: 'Identificar visitante' };

export default async function IdentificarVisitante({ searchParams }: { searchParams: Promise<{ visita?: string }> }) {
  const { visita } = await searchParams;
  return <ConsolaRecepcion visitaInicial={visita} />;
}
