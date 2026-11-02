import { BarraSuperior } from '@/components/layout/barra-superior';
import { Asistente } from './asistente';

export const metadata = { title: 'Pre-registro de visita' };

/**
 * Portal del visitante (V1 a V7 del prototipo): asistente de tres pasos
 * accesible por enlace con token, optimizado para móvil (RNF-05).
 */
export default async function PreRegistro({ params }: PageProps<'/pre-registro/[token]'>) {
  const { token } = await params;
  return (
    <div className="flex min-h-full flex-col">
      <BarraSuperior href={`/pre-registro/${token}`} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6">
        <Asistente token={token} />
      </main>
      <footer className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
        Sus datos se tratan según la Ley 1581 de 2012 · Sistema de Gestión de Visitantes
      </footer>
    </div>
  );
}
