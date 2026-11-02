import { cn } from '@/lib/utils';

/** Indicador de carga accesible, coherente con el resto del sistema. */
export function Cargando({ texto = 'Cargando…', className }: { texto?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-3 py-12 text-sm text-gray-500 dark:text-gray-400', className)}>
      <svg className="size-5 animate-spin text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {texto}
    </div>
  );
}

/** Bloques grises de carga para listas y tablas. */
export function Esqueleto({ lineas = 3, className }: { lineas?: number; className?: string }) {
  return (
    <div className={cn('animate-pulse space-y-3', className)} aria-hidden="true">
      {Array.from({ length: lineas }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-gray-200 dark:bg-white/10" style={{ width: `${100 - (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}
