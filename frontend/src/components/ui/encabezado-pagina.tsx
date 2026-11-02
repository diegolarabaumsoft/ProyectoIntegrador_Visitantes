import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · headings/page-headings (with actions). */
interface Props {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}

export function EncabezadoPagina({ titulo, descripcion, acciones, className }: Props) {
  return (
    <div className={cn('md:flex md:items-center md:justify-between', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl/8 font-bold break-words text-gray-900 sm:text-3xl sm:tracking-tight dark:text-white">{titulo}</h1>
        {descripcion ? <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="mt-4 flex gap-3 md:mt-0 md:ml-4">{acciones}</div> : null}
    </div>
  );
}
