'use client';

import { ChevronDownIcon, ExclamationCircleIcon } from '@heroicons/react/16/solid';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Campos de formulario adaptados de Tailwind Plus · forms/input-groups,
 * select-menus (native) y textareas. Todos aceptan `error` y `ayuda`.
 */

const CLASES_INPUT =
  'block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:outline-gray-200 dark:disabled:bg-white/10';

const CLASES_INPUT_ERROR =
  'pr-10 text-red-900 outline-red-300 placeholder:text-red-300 focus:outline-red-600 sm:pr-9 dark:text-red-400 dark:outline-red-500/50 dark:placeholder:text-red-400/70 dark:focus:outline-red-400';

interface PropsEnvoltura {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  /** Texto pequeño a la derecha de la etiqueta ("Opcional") */
  pista?: string;
  id: string;
  children: ReactNode;
  className?: string;
}

export function Envoltura({ etiqueta, ayuda, error, pista, id, children, className }: PropsEnvoltura) {
  return (
    <div className={className}>
      {etiqueta ? (
        <div className="flex justify-between">
          <label htmlFor={id} className="block text-sm/6 font-medium text-gray-900 dark:text-white">
            {etiqueta}
          </label>
          {pista ? <span className="text-sm/6 text-gray-500 dark:text-gray-400">{pista}</span> : null}
        </div>
      ) : null}
      <div className={cn(etiqueta && 'mt-2', 'grid grid-cols-1')}>{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

type PropsCampo = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id?: string;
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  pista?: string;
  className?: string;
};

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { id, etiqueta, ayuda, error, pista, className, ...resto },
  ref,
) {
  const generado = useId();
  const idFinal = id ?? generado;
  return (
    <Envoltura id={idFinal} etiqueta={etiqueta} ayuda={ayuda} error={error} pista={pista} className={className}>
      <input
        ref={ref}
        id={idFinal}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idFinal}-error` : ayuda ? `${idFinal}-ayuda` : undefined}
        className={cn('col-start-1 row-start-1', CLASES_INPUT, error && CLASES_INPUT_ERROR)}
        {...resto}
      />
      {error ? (
        <ExclamationCircleIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-3 size-5 self-center justify-self-end text-red-500 sm:size-4 dark:text-red-400"
        />
      ) : null}
    </Envoltura>
  );
});

type PropsSelector = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  id?: string;
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  pista?: string;
  className?: string;
  opciones: { valor: string; texto: string }[];
  /** Opción vacía inicial */
  marcador?: string;
};

export const Selector = forwardRef<HTMLSelectElement, PropsSelector>(function Selector(
  { id, etiqueta, ayuda, error, pista, className, opciones, marcador, ...resto },
  ref,
) {
  const generado = useId();
  const idFinal = id ?? generado;
  return (
    <Envoltura id={idFinal} etiqueta={etiqueta} ayuda={ayuda} error={error} pista={pista} className={className}>
      <select
        ref={ref}
        id={idFinal}
        aria-invalid={error ? true : undefined}
        className={cn(
          'col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus-visible:outline-indigo-500',
          error && 'outline-red-300 text-red-900 focus-visible:outline-red-600 dark:outline-red-500/50',
        )}
        {...resto}
      >
        {marcador ? <option value="">{marcador}</option> : null}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
      />
    </Envoltura>
  );
});

type PropsAreaTexto = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  id?: string;
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  pista?: string;
  className?: string;
};

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsAreaTexto>(function AreaTexto(
  { id, etiqueta, ayuda, error, pista, className, rows = 3, ...resto },
  ref,
) {
  const generado = useId();
  const idFinal = id ?? generado;
  return (
    <Envoltura id={idFinal} etiqueta={etiqueta} ayuda={ayuda} error={error} pista={pista} className={className}>
      <textarea
        ref={ref}
        id={idFinal}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn('col-start-1 row-start-1', CLASES_INPUT, error && CLASES_INPUT_ERROR)}
        {...resto}
      />
    </Envoltura>
  );
});
