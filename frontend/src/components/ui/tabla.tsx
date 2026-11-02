import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · lists/tables (simple in card). */
export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flow-root', className)}>
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div className="overflow-hidden shadow-sm outline-1 outline-black/5 sm:rounded-lg dark:shadow-none dark:-outline-offset-1 dark:outline-white/10">
            <table className="relative min-w-full divide-y divide-gray-300 dark:divide-white/15">{children}</table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Cabecera({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-gray-50 dark:bg-gray-800/75">
      <tr>{children}</tr>
    </thead>
  );
}

export function Cuerpo({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-gray-800/50">{children}</tbody>;
}

type PropsTh = ThHTMLAttributes<HTMLTableCellElement> & { primera?: boolean; ultima?: boolean; oculta?: boolean };

export function Th({ primera, ultima, oculta, className, children, ...resto }: PropsTh) {
  return (
    <th
      scope="col"
      className={cn(
        'py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200',
        primera ? 'pr-3 pl-4 sm:pl-6' : ultima ? 'pr-4 pl-3 sm:pr-6' : 'px-3',
        className,
      )}
      {...resto}
    >
      {oculta ? <span className="sr-only">{children}</span> : children}
    </th>
  );
}

type PropsTd = TdHTMLAttributes<HTMLTableCellElement> & { primera?: boolean; ultima?: boolean; principal?: boolean };

export function Td({ primera, ultima, principal, className, children, ...resto }: PropsTd) {
  return (
    <td
      className={cn(
        'py-4 text-sm whitespace-nowrap',
        primera ? 'pr-3 pl-4 sm:pl-6' : ultima ? 'pr-4 pl-3 text-right sm:pr-6' : 'px-3',
        principal ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400',
        className,
      )}
      {...resto}
    >
      {children}
    </td>
  );
}

export function FilaVacia({ columnas, children }: { columnas: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        {children}
      </td>
    </tr>
  );
}
