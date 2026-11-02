import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · navigation/progress-bars (progress bar). Indicador "Paso n de N". */
interface Props {
  pasos: string[];
  /** Índice del paso actual, base 0 */
  actual: number;
  className?: string;
}

export function Pasos({ pasos, actual, className }: Props) {
  const porcentaje = ((actual + 1) / pasos.length) * 100;
  return (
    <div className={className}>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        Paso {actual + 1} de {pasos.length}
        <span className="text-gray-500 dark:text-gray-400"> · {pasos[actual]}</span>
      </p>
      <div aria-hidden="true" className="mt-3">
        <div className="overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
          <div style={{ width: `${porcentaje}%` }} className="h-2 rounded-full bg-indigo-600 transition-all dark:bg-indigo-500" />
        </div>
        <div className={cn('mt-3 hidden text-xs font-medium text-gray-600 sm:grid dark:text-gray-400')} style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
          {pasos.map((p, i) => (
            <div
              key={p}
              className={cn(
                i <= actual && 'text-indigo-600 dark:text-indigo-400',
                i === 0 ? 'text-left' : i === pasos.length - 1 ? 'text-right' : 'text-center',
              )}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
