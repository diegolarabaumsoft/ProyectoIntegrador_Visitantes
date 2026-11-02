'use client';

import { Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Notificaciones flotantes adaptadas de Tailwind Plus · overlays/notifications (simple).
 * Uso: `const notificar = useNotificar(); notificar.exito('Invitación enviada', 'El visitante recibirá un correo.')`
 */
export type TipoNotificacion = 'exito' | 'error' | 'advertencia' | 'info';

interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje?: string;
}

interface ContextoNotificaciones {
  mostrar: (tipo: TipoNotificacion, titulo: string, mensaje?: string) => void;
}

const Contexto = createContext<ContextoNotificaciones | null>(null);

const ICONOS: Record<TipoNotificacion, { Icono: typeof CheckCircleIcon; clase: string }> = {
  exito: { Icono: CheckCircleIcon, clase: 'text-green-400' },
  error: { Icono: XCircleIcon, clase: 'text-red-400' },
  advertencia: { Icono: ExclamationTriangleIcon, clase: 'text-yellow-400' },
  info: { Icono: InformationCircleIcon, clase: 'text-blue-400' },
};

const DURACION_MS = 6000;

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);

  const cerrar = useCallback((id: number) => setLista((l) => l.filter((n) => n.id !== id)), []);

  const mostrar = useCallback(
    (tipo: TipoNotificacion, titulo: string, mensaje?: string) => {
      const id = Date.now() + Math.random();
      setLista((l) => [...l, { id, tipo, titulo, mensaje }]);
      window.setTimeout(() => cerrar(id), DURACION_MS);
    },
    [cerrar],
  );

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto value={valor}>
      {children}
      <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-[60] flex items-end px-4 py-6 sm:items-start sm:p-6">
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {lista.map((n) => {
            const { Icono, clase } = ICONOS[n.tipo];
            return (
              <Transition key={n.id} show appear>
                <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg outline-1 outline-black/5 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0 dark:bg-gray-800 dark:-outline-offset-1 dark:outline-white/10">
                  <div className="p-4">
                    <div className="flex items-start">
                      <div className="shrink-0">
                        <Icono aria-hidden="true" className={cn('size-6', clase)} />
                      </div>
                      <div className="ml-3 w-0 flex-1 pt-0.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{n.titulo}</p>
                        {n.mensaje ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{n.mensaje}</p> : null}
                      </div>
                      <div className="ml-4 flex shrink-0">
                        <button
                          type="button"
                          onClick={() => cerrar(n.id)}
                          className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600 dark:hover:text-white dark:focus:outline-indigo-500"
                        >
                          <span className="sr-only">Cerrar</span>
                          <XMarkIcon aria-hidden="true" className="size-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            );
          })}
        </div>
      </div>
    </Contexto>
  );
}

export function useNotificar() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useNotificar debe usarse dentro de NotificacionesProvider');
  return useMemo(
    () => ({
      exito: (titulo: string, mensaje?: string) => ctx.mostrar('exito', titulo, mensaje),
      error: (titulo: string, mensaje?: string) => ctx.mostrar('error', titulo, mensaje),
      advertencia: (titulo: string, mensaje?: string) => ctx.mostrar('advertencia', titulo, mensaje),
      info: (titulo: string, mensaje?: string) => ctx.mostrar('info', titulo, mensaje),
    }),
    [ctx],
  );
}
