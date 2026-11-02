import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { EstadoVisita } from '@/types/api';
import { NOMBRE_ESTADO_VISITA } from '@/types/api';

/** Adaptado de Tailwind Plus · elements/badges (flat with dot). */
export type ColorInsignia = 'gris' | 'rojo' | 'amarillo' | 'verde' | 'azul' | 'indigo' | 'morado';

const COLORES: Record<ColorInsignia, { fondo: string; punto: string }> = {
  gris: { fondo: 'bg-gray-100 text-gray-600 dark:bg-gray-400/10 dark:text-gray-400', punto: 'fill-gray-400' },
  rojo: { fondo: 'bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-400', punto: 'fill-red-500 dark:fill-red-400' },
  amarillo: { fondo: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-400/10 dark:text-yellow-500', punto: 'fill-yellow-500 dark:fill-yellow-400' },
  verde: { fondo: 'bg-green-100 text-green-700 dark:bg-green-400/10 dark:text-green-400', punto: 'fill-green-500 dark:fill-green-400' },
  azul: { fondo: 'bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400', punto: 'fill-blue-500 dark:fill-blue-400' },
  indigo: { fondo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400', punto: 'fill-indigo-500 dark:fill-indigo-400' },
  morado: { fondo: 'bg-purple-100 text-purple-700 dark:bg-purple-400/10 dark:text-purple-400', punto: 'fill-purple-500 dark:fill-purple-400' },
};

interface Props {
  color?: ColorInsignia;
  punto?: boolean;
  children: ReactNode;
  className?: string;
}

export function Insignia({ color = 'gris', punto = true, children, className }: Props) {
  const c = COLORES[color];
  return (
    <span className={cn('inline-flex items-center gap-x-1.5 rounded-md px-2 py-1 text-xs font-medium', c.fondo, className)}>
      {punto ? (
        <svg viewBox="0 0 6 6" aria-hidden="true" className={cn('size-1.5', c.punto)}>
          <circle r={3} cx={3} cy={3} />
        </svg>
      ) : null}
      {children}
    </span>
  );
}

const COLOR_ESTADO: Record<EstadoVisita, ColorInsignia> = {
  PROGRAMADA: 'gris',
  PRE_REGISTRADA: 'azul',
  EN_PLANTA: 'verde',
  FINALIZADA: 'indigo',
  CANCELADA: 'amarillo',
  BLOQUEADA: 'rojo',
};

/** Insignia de estado de visita con los colores del prototipo. */
export function InsigniaEstadoVisita({ estado, className }: { estado: EstadoVisita; className?: string }) {
  return (
    <Insignia color={COLOR_ESTADO[estado]} className={className}>
      {NOMBRE_ESTADO_VISITA[estado]}
    </Insignia>
  );
}
