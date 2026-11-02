'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { useNotificar } from '@/components/ui/notificaciones';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { RUTA_INICIO } from '@/lib/roles';
import type { UsuarioAutenticado } from '@/types/api';

const schema = z
  .object({
    actual: z.string().min(1, 'Indique su contraseña actual'),
    nueva: z.string().min(10, 'Debe tener al menos 10 caracteres').max(128, 'Máximo 128 caracteres'),
    confirmacion: z.string(),
  })
  .refine((v) => v.nueva === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' });
type Formulario = z.infer<typeof schema>;

/** Cambio de contraseña. Adaptado de Tailwind Plus · forms/form-layouts (stacked). */
export function CambiarContrasena() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const { data: usuario } = useQuery({ queryKey: ['auth', 'me'], queryFn: () => apiGet<UsuarioAutenticado>('/auth/me') });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Formulario>({ resolver: zodResolver(schema), defaultValues: { actual: '', nueva: '', confirmacion: '' } });
  const cambiar = useMutation({
    mutationFn: ({ actual, nueva }: Formulario) => apiPost<void>('/auth/cambiar-contrasena', { actual, nueva }),
    onSuccess: async () => {
      reset();
      notificar.exito('Contraseña actualizada');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      if (usuario?.debeCambiarContrasena) window.location.assign(RUTA_INICIO[usuario.rol]);
    },
  });

  return (
    <div className="max-w-xl space-y-6">
      <EncabezadoPagina titulo="Cambiar contraseña" />
      {usuario?.debeCambiarContrasena ? <Alerta tipo="advertencia" titulo="Contraseña temporal">Debe cambiarla para seguir usando el sistema.</Alerta> : null}
      <form onSubmit={handleSubmit((v) => cambiar.mutate(v))}>
        <Tarjeta pie={<Boton type="submit" cargando={cambiar.isPending}>Guardar</Boton>}>
          <div className="space-y-4">
            <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" {...register('actual')} error={errors.actual?.message} />
            <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" ayuda="Al menos 10 caracteres" {...register('nueva')} error={errors.nueva?.message} />
            <Campo etiqueta="Confirmar contraseña nueva" type="password" autoComplete="new-password" {...register('confirmacion')} error={errors.confirmacion?.message} />
            {cambiar.isError ? <Alerta tipo="error">{cambiar.error instanceof ApiError ? cambiar.error.message : 'No se pudo cambiar la contraseña'}</Alerta> : null}
          </div>
        </Tarjeta>
      </form>
    </div>
  );
}
