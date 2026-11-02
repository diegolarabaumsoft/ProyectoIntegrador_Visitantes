import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · data-display/stats (simple in cards). */
export interface Estadistica {
  nombre: string;
  valor: ReactNode;
  detalle?: ReactNode;
}

export function Estadisticas({ items, columnas = 4, className }: { items: Estadistica[]; columnas?: 2 | 3 | 4; className?: string }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columnas];
  return (
    <dl className={cn('grid grid-cols-1 gap-5', cols, className)}>
      {items.map((item) => (
        <div
          key={item.nombre}
          className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow-sm sm:p-6 dark:bg-gray-800/75 dark:inset-ring dark:inset-ring-white/10"
        >
          <dt className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">{item.nombre}</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{item.valor}</dd>
          {item.detalle ? <dd className="mt-2 text-sm text-gray-500 dark:text-gray-400">{item.detalle}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
