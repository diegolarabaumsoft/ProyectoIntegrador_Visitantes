import { Suspense } from 'react';
import { Logo } from '@/components/layout/logo';
import { Esqueleto } from '@/components/ui/cargando';
import { FormularioLogin } from './formulario-login';

export const metadata = { title: 'Iniciar sesión' };

/** L1 / L1b del prototipo, adaptado de Tailwind Plus · forms/sign-in-forms (simple card). */
export default function Login() {
  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Logo compacto className="justify-center" />
        <h1 className="mt-6 text-center text-2xl/9 font-bold tracking-tight text-gray-900 dark:text-white">Iniciar sesión</h1>
        <p className="mt-2 text-center text-sm/6 text-gray-500 dark:text-gray-400">
          Sistema de Gestión de Visitantes · Planta Textil Bogotá
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-white px-6 py-12 shadow-sm sm:rounded-lg sm:px-12 dark:bg-gray-800/50 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10">
          <Suspense fallback={<Esqueleto lineas={5} />}>
            <FormularioLogin />
          </Suspense>
          <p className="mt-8 text-center text-xs/5 text-gray-500 dark:text-gray-400">
            Por seguridad, la sesión se cierra tras 15 minutos de inactividad y la cuenta se bloquea tras 5 intentos fallidos.
          </p>
        </div>
      </div>
    </div>
  );
}
