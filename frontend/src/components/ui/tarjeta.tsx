import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · layout/cards (with header and footer) y description-lists (in card). */
interface Props {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  /** Acciones a la derecha del título */
  acciones?: ReactNode;
  pie?: ReactNode;
  /** Sin relleno interno en el cuerpo (tablas, listas) */
  sinRelleno?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Tarjeta({ titulo, descripcion, acciones, pie, sinRelleno, children, className }: Props) {
  return (
    <div
      className={cn(
        'divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm dark:divide-white/10 dark:bg-gray-800/50 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10',
        className,
      )}
    >
      {titulo || acciones ? (
        <div className="flex items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            {titulo ? <h3 className="text-base/7 font-semibold text-gray-900 dark:text-white">{titulo}</h3> : null}
            {descripcion ? <p className="mt-1 max-w-2xl text-sm/6 text-gray-500 dark:text-gray-300">{descripcion}</p> : null}
          </div>
          {acciones ? <div className="shrink-0">{acciones}</div> : null}
        </div>
      ) : null}
      {children !== undefined ? <div className={cn(!sinRelleno && 'px-4 py-5 sm:p-6')}>{children}</div> : null}
      {pie ? <div className="px-4 py-4 sm:px-6">{pie}</div> : null}
    </div>
  );
}

interface ItemDescripcion {
  termino: ReactNode;
  valor: ReactNode;
}

/**
 * Lista de descripción (dl) para fichas de visitante, visita, etc.
 * `compacta` apila término y valor (para tarjetas laterales estrechas).
 */
export function ListaDescripcion({ items, compacta, className }: { items: ItemDescripcion[]; compacta?: boolean; className?: string }) {
  return (
    <dl className={cn('divide-y divide-gray-100 dark:divide-white/5', className)}>
      {items.map((item, i) => (
        <div key={i} className={cn('px-4 py-4 sm:px-6', !compacta && 'sm:grid sm:grid-cols-3 sm:gap-4')}>
          <dt className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.termino}</dt>
          <dd className={cn('mt-1 text-sm/6 break-words text-gray-700 dark:text-gray-300', !compacta && 'sm:col-span-2 sm:mt-0')}>{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
