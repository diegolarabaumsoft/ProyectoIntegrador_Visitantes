import type { ComponentType, ReactNode, SVGProps } from 'react';
import { InboxIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · feedback/empty-states (simple). */
interface Props {
  titulo: ReactNode;
  descripcion?: ReactNode;
  icono?: ComponentType<SVGProps<SVGSVGElement>>;
  accion?: ReactNode;
  className?: string;
}

export function EstadoVacio({ titulo, descripcion, icono: Icono = InboxIcon, accion, className }: Props) {
  return (
    <div className={cn('py-12 text-center', className)}>
      <Icono aria-hidden="true" className="mx-auto size-12 text-gray-400 dark:text-gray-500" />
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{titulo}</h3>
      {descripcion ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{descripcion}</p> : null}
      {accion ? <div className="mt-6">{accion}</div> : null}
    </div>
  );
}
