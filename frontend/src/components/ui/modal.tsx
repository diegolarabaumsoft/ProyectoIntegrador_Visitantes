'use client';

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';

/** Adaptado de Tailwind Plus · overlays/modal-dialogs (simple with dismiss button). */
interface Props {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  icono?: ComponentType<SVGProps<SVGSVGElement>>;
  tonoIcono?: 'rojo' | 'amarillo' | 'verde' | 'indigo';
  /** Botones, normalmente el principal primero */
  acciones?: ReactNode;
  children?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
}

const TONOS = {
  rojo: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  amarillo: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400',
  verde: 'bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400',
  indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
};

const ANCHOS = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export function Modal({ abierto, onCerrar, titulo, descripcion, icono: Icono, tonoIcono = 'indigo', acciones, children, ancho = 'md' }: Props) {
  return (
    <Dialog open={abierto} onClose={onCerrar} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50"
      />
      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className={cn(
              'relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10',
              ANCHOS[ancho],
            )}
          >
            <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600 dark:bg-gray-800 dark:hover:text-gray-300 dark:focus:outline-white"
              >
                <span className="sr-only">Cerrar</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>
            <div className="sm:flex sm:items-start">
              {Icono ? (
                <div className={cn('mx-auto flex size-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:size-10', TONOS[tonoIcono])}>
                  <Icono aria-hidden="true" className="size-6" />
                </div>
              ) : null}
              <div className={cn('mt-3 text-center sm:mt-0 sm:text-left', Icono && 'sm:ml-4', 'min-w-0 flex-1')}>
                <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">
                  {titulo}
                </DialogTitle>
                {descripcion ? <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{descripcion}</p> : null}
                {children ? <div className="mt-4">{children}</div> : null}
              </div>
            </div>
            {acciones ? <div className="mt-5 flex flex-col-reverse gap-3 sm:mt-4 sm:flex-row-reverse">{acciones}</div> : null}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
