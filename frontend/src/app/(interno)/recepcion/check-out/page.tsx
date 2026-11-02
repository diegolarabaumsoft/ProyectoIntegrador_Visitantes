import { ConsolaCheckOut } from './consola-check-out';

export const metadata = { title: 'Check-out' };

export default async function PaginaCheckOut({ searchParams }: { searchParams: Promise<{ visitaId?: string }> }) {
  const { visitaId } = await searchParams;
  return <ConsolaCheckOut visitaInicial={visitaId} />;
}
