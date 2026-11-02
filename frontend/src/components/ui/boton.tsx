import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · elements/buttons (primary, secondary, soft). */
export type VarianteBoton = 'primario' | 'secundario' | 'suave' | 'peligro' | 'enlace';
export type TamanoBoton = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const VARIANTES: Record<VarianteBoton, string> = {
  primario:
    'bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-500',
  secundario:
    'bg-white text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20',
  suave:
    'bg-indigo-50 text-indigo-600 shadow-xs hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-400 dark:shadow-none dark:hover:bg-indigo-500/30',
  peligro:
    'bg-red-600 text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-red-500 dark:shadow-none dark:hover:bg-red-400',
  enlace:
    'text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 shadow-none px-0',
};

const TAMANOS: Record<TamanoBoton, string> = {
  xs: 'rounded-sm px-2 py-1 text-xs',
  sm: 'rounded-sm px-2 py-1 text-sm',
  md: 'rounded-md px-2.5 py-1.5 text-sm',
  lg: 'rounded-md px-3 py-2 text-sm',
  xl: 'rounded-md px-3.5 py-2.5 text-sm',
};

type Icono = ComponentType<SVGProps<SVGSVGElement>>;

interface PropsBase {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Ocupa todo el ancho (botón principal en móvil) */
  bloque?: boolean;
  cargando?: boolean;
  iconoInicio?: Icono;
  iconoFin?: Icono;
  children: ReactNode;
  className?: string;
}

type PropsBoton = PropsBase & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & { href?: undefined };
type PropsEnlace = PropsBase & { href: string; disabled?: boolean; type?: never; onClick?: never };

function clases({ variante = 'primario', tamano = 'lg', bloque, className }: PropsBase) {
  return cn(
    'inline-flex items-center justify-center gap-x-1.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTES[variante],
    variante === 'enlace' ? 'text-sm' : TAMANOS[tamano],
    bloque && 'w-full',
    className,
  );
}

function Contenido({ cargando, iconoInicio: IconoInicio, iconoFin: IconoFin, children }: PropsBase) {
  return (
    <>
      {cargando ? (
        <svg className="-ml-0.5 size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : IconoInicio ? (
        <IconoInicio aria-hidden="true" className="-ml-0.5 size-5" />
      ) : null}
      {children}
      {IconoFin ? <IconoFin aria-hidden="true" className="-mr-0.5 size-5" /> : null}
    </>
  );
}

export function Boton(props: PropsBoton | PropsEnlace) {
  if (props.href !== undefined) {
    const { href, disabled, ...resto } = props;
    return (
      <Link href={href} aria-disabled={disabled} className={clases(resto)}>
        <Contenido {...resto} />
      </Link>
    );
  }
  const { variante, tamano, bloque, cargando, iconoInicio, iconoFin, children, className, type = 'button', disabled, ...resto } = props;
  const base = { variante, tamano, bloque, cargando, iconoInicio, iconoFin, children, className };
  return (
    <button type={type} disabled={disabled || cargando} className={clases(base)} {...resto}>
      <Contenido {...base} />
    </button>
  );
}
