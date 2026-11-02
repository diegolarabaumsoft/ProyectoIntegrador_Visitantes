'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · forms/checkboxes (list with description). */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  id?: string;
  etiqueta: ReactNode;
  descripcion?: ReactNode;
  error?: string;
  className?: string;
};

export const Casilla = forwardRef<HTMLInputElement, Props>(function Casilla(
  { id, etiqueta, descripcion, error, className, ...resto },
  ref,
) {
  const generado = useId();
  const idFinal = id ?? generado;
  return (
    <div className={className}>
      <div className="flex gap-3">
        <div className="flex h-6 shrink-0 items-center">
          <div className="group grid size-4 grid-cols-1">
            <input
              ref={ref}
              id={idFinal}
              type="checkbox"
              aria-describedby={descripcion ? `${idFinal}-descripcion` : undefined}
              aria-invalid={error ? true : undefined}
              className={cn(
                'col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 dark:indeterminate:border-indigo-500 dark:indeterminate:bg-indigo-500 dark:focus-visible:outline-indigo-500 dark:disabled:border-white/5 dark:disabled:bg-white/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto',
                error && 'border-red-400',
              )}
              {...resto}
            />
            <svg
              fill="none"
              viewBox="0 0 14 14"
              className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25 dark:group-has-disabled:stroke-white/25"
            >
              <path
                d="M3 8L6 11L11 3.5"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-0 group-has-checked:opacity-100"
              />
              <path
                d="M3 7H11"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-0 group-has-indeterminate:opacity-100"
              />
            </svg>
          </div>
        </div>
        <div className="text-sm/6">
          <label htmlFor={idFinal} className="font-medium text-gray-900 dark:text-white">
            {etiqueta}
          </label>
          {descripcion ? (
            <p id={`${idFinal}-descripcion`} className="text-gray-500 dark:text-gray-400">
              {descripcion}
            </p>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
});

/** Adaptado de Tailwind Plus · forms/radio-groups (simple list). */
interface OpcionRadio {
  valor: string;
  etiqueta: ReactNode;
  descripcion?: ReactNode;
}

interface PropsGrupoRadio {
  nombre: string;
  leyenda?: ReactNode;
  descripcion?: ReactNode;
  opciones: OpcionRadio[];
  valor?: string;
  onChange?: (valor: string) => void;
  error?: string;
  className?: string;
}

export function GrupoRadio({ nombre, leyenda, descripcion, opciones, valor, onChange, error, className }: PropsGrupoRadio) {
  return (
    <fieldset className={className}>
      {leyenda ? <legend className="text-sm/6 font-semibold text-gray-900 dark:text-white">{leyenda}</legend> : null}
      {descripcion ? <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">{descripcion}</p> : null}
      <div className={cn(leyenda || descripcion ? 'mt-4' : '', 'space-y-4')}>
        {opciones.map((opcion) => {
          const id = `${nombre}-${opcion.valor}`;
          return (
            <div key={opcion.valor} className="flex items-start gap-3">
              <input
                id={id}
                name={nombre}
                type="radio"
                value={opcion.valor}
                checked={valor === opcion.valor}
                onChange={() => onChange?.(opcion.valor)}
                className="relative mt-1 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-indigo-600 checked:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-white/10 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 dark:focus-visible:outline-indigo-500 forced-colors:appearance-auto forced-colors:before:hidden"
              />
              <label htmlFor={id} className="block text-sm/6 text-gray-900 dark:text-white">
                <span className="font-medium">{opcion.etiqueta}</span>
                {opcion.descripcion ? <span className="block text-gray-500 dark:text-gray-400">{opcion.descripcion}</span> : null}
              </label>
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </fieldset>
  );
}
