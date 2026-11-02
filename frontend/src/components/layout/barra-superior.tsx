import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';

interface Props {
  acciones?: ReactNode;
  href?: string;
}

/**
 * Cabecera simple para las vistas públicas (login, portal del visitante).
 * Adaptada de Tailwind Plus · application-shells/stacked (with bottom border).
 */
export function BarraSuperior({ acciones, href = '/' }: Props) {
  return (
    <header className="border-b border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo href={href} />
        {acciones ? <div className="flex items-center gap-3">{acciones}</div> : null}
      </div>
    </header>
  );
}
