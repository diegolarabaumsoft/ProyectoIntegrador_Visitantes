'use client';

import { Dialog, DialogBackdrop, DialogPanel, Menu, MenuButton, MenuItem, MenuItems, TransitionChild } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  ArchiveBoxIcon,
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  BellAlertIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  HomeIcon,
  MapIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Logo } from '@/components/layout/logo';
import { NAVEGACION, NOMBRE_ROL, RUTA_INICIO, type IconoNavegacion, type Rol } from '@/lib/roles';
import { cn } from '@/lib/utils';

/**
 * Shell de las vistas internas, adaptado de Tailwind Plus ·
 * application-shells/sidebar (sidebar with header): barra lateral fija en
 * escritorio, cajón deslizante en móvil y cabecera con menú de usuario.
 */
const ICONOS: Record<IconoNavegacion, ComponentType<SVGProps<SVGSVGElement>>> = {
  inicio: HomeIcon,
  calendario: CalendarDaysIcon,
  invitacion: EnvelopeIcon,
  qr: QrCodeIcon,
  usuarios: UsersIcon,
  salida: ArrowRightStartOnRectangleIcon,
  alerta: BellAlertIcon,
  grafico: ChartBarSquareIcon,
  escudo: ShieldCheckIcon,
  documento: DocumentTextIcon,
  ajustes: Cog6ToothIcon,
  mapa: MapIcon,
  archivo: ArchiveBoxIcon,
};

interface Props {
  rol: Rol;
  /** Nombre del usuario para la cabecera; si no se conoce, se muestra el rol */
  nombreUsuario?: string;
  onCerrarSesion?: () => void;
  children: ReactNode;
}

function Navegacion({ rol, onNavegar }: { rol: Rol; onNavegar?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col">
      <ul role="list" className="flex flex-1 flex-col gap-y-7">
        <li>
          <ul role="list" className="-mx-2 space-y-1">
            {NAVEGACION[rol].map((item) => {
              const Icono = ICONOS[item.icono];
              const activo = pathname === item.href || (item.href !== RUTA_INICIO[rol] && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavegar}
                    aria-current={activo ? 'page' : undefined}
                    className={cn(
                      activo
                        ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                      'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                    )}
                  >
                    <Icono
                      aria-hidden="true"
                      className={cn(
                        activo ? 'text-indigo-600 dark:text-white' : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white',
                        'size-6 shrink-0',
                      )}
                    />
                    {item.etiqueta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
        <li className="mt-auto">
          <div className="-mx-2 rounded-md bg-gray-50 p-3 text-xs/5 text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{NOMBRE_ROL[rol]}</span>
            <br />
            Sistema de Gestión de Visitantes
          </div>
        </li>
      </ul>
    </nav>
  );
}

export function ShellInterno({ rol, nombreUsuario, onCerrarSesion, children }: Props) {
  const [abierto, setAbierto] = useState(false);
  const iniciales = (nombreUsuario ?? NOMBRE_ROL[rol])
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div>
      {/* Cajón lateral en móvil */}
      <Dialog open={abierto} onClose={setAbierto} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />
        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button type="button" onClick={() => setAbierto(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Cerrar menú</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>
            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4 dark:bg-gray-900 dark:ring dark:ring-white/10">
              <div className="relative flex h-16 shrink-0 items-center">
                <Logo href={RUTA_INICIO[rol]} />
              </div>
              <Navegacion rol={rol} onNavegar={() => setAbierto(false)} />
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Barra lateral fija en escritorio */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4 dark:border-white/10 dark:bg-black/10">
          <div className="flex h-16 shrink-0 items-center">
            <Logo href={RUTA_INICIO[rol]} />
          </div>
          <Navegacion rol={rol} />
        </div>
      </div>

      <div className="lg:pl-72">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-xs sm:gap-x-6 sm:px-6 lg:px-8 dark:border-white/10 dark:bg-gray-900 dark:shadow-none">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:text-white"
          >
            <span className="sr-only">Abrir menú</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
          <div aria-hidden="true" className="h-6 w-px bg-gray-200 lg:hidden dark:bg-white/10" />

          <div className="flex flex-1 items-center justify-end gap-x-4 self-stretch lg:gap-x-6">
            <Menu as="div" className="relative">
              <MenuButton className="relative flex items-center">
                <span className="absolute -inset-1.5" />
                <span className="sr-only">Abrir menú de usuario</span>
                <span className="flex size-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 outline -outline-offset-1 outline-black/5 dark:bg-indigo-500/20 dark:text-indigo-300 dark:outline-white/10">
                  {iniciales || 'U'}
                </span>
                <span className="hidden lg:flex lg:items-center">
                  <span aria-hidden="true" className="ml-4 text-sm/6 font-semibold text-gray-900 dark:text-white">
                    {nombreUsuario ?? NOMBRE_ROL[rol]}
                  </span>
                  <ChevronDownIcon aria-hidden="true" className="ml-2 size-5 text-gray-400 dark:text-gray-500" />
                </span>
              </MenuButton>
              <MenuItems
                transition
                className="absolute right-0 z-10 mt-2.5 w-48 origin-top-right rounded-md bg-white py-2 shadow-lg outline-1 outline-gray-900/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
              >
                <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">{NOMBRE_ROL[rol]}</div>
                <MenuItem>
                  <Link href="/cuenta/contrasena" className="block w-full px-3 py-1 text-left text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5">
                    Cambiar contraseña
                  </Link>
                </MenuItem>
                <MenuItem>
                  <button
                    type="button"
                    onClick={onCerrarSesion}
                    className="block w-full px-3 py-1 text-left text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5"
                  >
                    Cerrar sesión
                  </button>
                </MenuItem>
              </MenuItems>
            </Menu>
          </div>
        </div>

        <main className="py-8 sm:py-10">
          <div className="px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
