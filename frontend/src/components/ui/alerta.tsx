import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/react/20/solid';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · feedback/alerts (with description). */
export type TipoAlerta = 'info' | 'exito' | 'advertencia' | 'error';

const ESTILOS: Record<TipoAlerta, { caja: string; icono: string; titulo: string; texto: string; Icono: typeof CheckCircleIcon }> = {
  info: {
    caja: 'bg-blue-50 dark:bg-blue-500/10 dark:outline dark:outline-blue-500/15',
    icono: 'text-blue-400 dark:text-blue-300',
    titulo: 'text-blue-800 dark:text-blue-100',
    texto: 'text-blue-700 dark:text-blue-100/80',
    Icono: InformationCircleIcon,
  },
  exito: {
    caja: 'bg-green-50 dark:bg-green-500/10 dark:outline dark:outline-green-500/15',
    icono: 'text-green-400 dark:text-green-300',
    titulo: 'text-green-800 dark:text-green-100',
    texto: 'text-green-700 dark:text-green-100/80',
    Icono: CheckCircleIcon,
  },
  advertencia: {
    caja: 'bg-yellow-50 dark:bg-yellow-500/10 dark:outline dark:outline-yellow-500/15',
    icono: 'text-yellow-400 dark:text-yellow-300',
    titulo: 'text-yellow-800 dark:text-yellow-100',
    texto: 'text-yellow-700 dark:text-yellow-100/80',
    Icono: ExclamationTriangleIcon,
  },
  error: {
    caja: 'bg-red-50 dark:bg-red-500/10 dark:outline dark:outline-red-500/15',
    icono: 'text-red-400 dark:text-red-300',
    titulo: 'text-red-800 dark:text-red-100',
    texto: 'text-red-700 dark:text-red-100/80',
    Icono: XCircleIcon,
  },
};

interface Props {
  tipo?: TipoAlerta;
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Alerta({ tipo = 'info', titulo, children, className }: Props) {
  const e = ESTILOS[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cn('rounded-md p-4', e.caja, className)}>
      <div className="flex">
        <div className="shrink-0">
          <e.Icono aria-hidden="true" className={cn('size-5', e.icono)} />
        </div>
        <div className="ml-3">
          {titulo ? <h3 className={cn('text-sm font-medium', e.titulo)}>{titulo}</h3> : null}
          {children ? <div className={cn(titulo && 'mt-2', 'text-sm', e.texto)}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
