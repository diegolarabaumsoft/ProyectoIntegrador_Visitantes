'use client';

import { ChevronDownIcon } from '@heroicons/react/16/solid';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · navigation/tabs (tabs in pills). Útil como filtros. */
export interface Pestana<V extends string = string> {
  valor: V;
  texto: string;
  cantidad?: number;
}

interface Props<V extends string> {
  pestanas: Pestana<V>[];
  valor: V;
  onChange: (valor: V) => void;
  etiqueta?: string;
  className?: string;
}

export function PestanasPildora<V extends string>({ pestanas, valor, onChange, etiqueta = 'Filtro', className }: Props<V>) {
  return (
    <div className={className}>
      <div className="grid grid-cols-1 sm:hidden">
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value as V)}
          aria-label={etiqueta}
          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-2 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-gray-100 dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500"
        >
          {pestanas.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.texto}
              {p.cantidad !== undefined ? ` (${p.cantidad})` : ''}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end fill-gray-500 dark:fill-gray-400"
        />
      </div>
      <div className="hidden sm:block">
        <nav aria-label={etiqueta} className="flex flex-wrap gap-2">
          {pestanas.map((p) => {
            const activa = p.valor === valor;
            return (
              <button
                key={p.valor}
                type="button"
                onClick={() => onChange(p.valor)}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  activa
                    ? 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                  'rounded-md px-3 py-2 text-sm font-medium',
                )}
              >
                {p.texto}
                {p.cantidad !== undefined ? (
                  <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-300">
                    {p.cantidad}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
