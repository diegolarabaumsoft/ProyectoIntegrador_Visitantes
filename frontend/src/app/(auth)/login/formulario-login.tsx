'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { ApiError, apiPost } from '@/lib/api';
import { RUTA_INICIO, rutaPermitida } from '@/lib/roles';
import type { UsuarioAutenticado } from '@/types/api';

const esquema = z.object({
  correo: z.string().trim().email('Ingrese un correo válido'),
  contrasena: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

type Valores = z.infer<typeof esquema>;

/**
 * Formulario de inicio de sesión (L1) y estado de cuenta bloqueada (L1b).
 * Adaptado de Tailwind Plus · forms/sign-in-forms (simple card).
 */
export function FormularioLogin() {
  const parametros = useSearchParams();
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: { correo: '', contrasena: '' } });

  const motivo = parametros.get('motivo');
  const volverA = parametros.get('volverA');

  async function enviar(valores: Valores) {
    setErrorGeneral(null);
    setBloqueo(null);
    try {
      const { usuario } = await apiPost<{ usuario: UsuarioAutenticado }>('/auth/login', valores);
      const destino = volverA && rutaPermitida(usuario.rol, volverA) ? volverA : RUTA_INICIO[usuario.rol];
      // Recarga completa para que proxy.ts vea las cookies recién emitidas
      window.location.assign(new URL(destino, window.location.origin).toString());
    } catch (error) {
      if (error instanceof ApiError && error.codigo === 'CUENTA_BLOQUEADA') {
        setBloqueo(error.message);
      } else if (error instanceof ApiError) {
        const restantes = (error.detalles as { intentosRestantes?: number } | undefined)?.intentosRestantes;
        setErrorGeneral(
          restantes !== undefined && restantes <= 2 ? `${error.message}. Le quedan ${restantes} intentos antes del bloqueo.` : error.message,
        );
      } else {
        setErrorGeneral('No fue posible conectar con el servidor. Intente de nuevo.');
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="space-y-6">
      {motivo === 'sesion' && !errorGeneral && !bloqueo ? (
        <Alerta tipo="info">Su sesión se cerró por inactividad. Inicie sesión de nuevo para continuar.</Alerta>
      ) : null}

      {bloqueo ? (
        <Alerta tipo="error" titulo="Cuenta bloqueada">
          {bloqueo}
        </Alerta>
      ) : errorGeneral ? (
        <Alerta tipo="error">{errorGeneral}</Alerta>
      ) : null}

      <Campo
        etiqueta="Correo electrónico"
        type="email"
        autoComplete="email"
        placeholder="nombre@plantatextil.local"
        error={errors.correo?.message}
        {...register('correo')}
      />
      <Campo
        etiqueta="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />

      <div className="flex items-center justify-end text-sm/6">
        <a href="#" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
          ¿Olvidó su contraseña?
        </a>
      </div>

      <Boton type="submit" bloque tamano="lg" cargando={isSubmitting} iconoInicio={LockClosedIcon}>
        Iniciar sesión
      </Boton>
    </form>
  );
}
