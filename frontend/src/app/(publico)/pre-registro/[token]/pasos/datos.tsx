'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Pasos } from '@/components/ui/pasos';
import { ApiError } from '@/lib/api';
import { preRegistroApi, type EstadoPreRegistro } from '@/services/pre-registro';
import { NOMBRE_TIPO_DOCUMENTO, type TipoDocumento } from '@/types/api';

export const PASOS = ['Datos', 'Consentimiento', 'Inducción'];

const esquema = z.object({
  nombreCompleto: z.string().trim().min(3, 'Ingrese su nombre completo').max(120),
  tipoDocumento: z.enum(['CC', 'CE', 'PASAPORTE', 'OTRO']),
  numeroDocumento: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.\-\s]{5,30}$/, 'Ingrese un número de documento válido'),
  empresa: z.string().trim().min(2, 'Ingrese su empresa').max(120),
  correo: z.string().trim().email('Ingrese un correo válido'),
  telefono: z
    .string()
    .trim()
    .regex(/^[+\d\s()-]{7,20}$/, 'Ingrese un teléfono válido')
    .or(z.literal('')),
});

type Valores = z.infer<typeof esquema>;

const OPCIONES_DOCUMENTO = (Object.keys(NOMBRE_TIPO_DOCUMENTO) as TipoDocumento[]).map((v) => ({ valor: v, texto: NOMBRE_TIPO_DOCUMENTO[v] }));

/** V2 · Paso 1 Datos personales (HU-03). Solo los campos mínimos necesarios. */
export function PasoDatos({ token, estado, onListo }: { token: string; estado: EstadoPreRegistro; onListo: (estado: EstadoPreRegistro) => void }) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombreCompleto: estado.visitante.nombreCompleto,
      tipoDocumento: estado.visitante.tipoDocumento,
      numeroDocumento: estado.visitante.numeroDocumento,
      empresa: estado.visitante.empresa,
      correo: estado.visitante.correo,
      telefono: estado.visitante.telefono ?? '',
    },
  });

  const guardar = useMutation({
    mutationFn: (v: Valores) => preRegistroApi.guardarDatos(token, { ...v, telefono: v.telefono || undefined }),
    onSuccess: onListo,
    onError: (e) => setErrorGeneral(e instanceof ApiError ? e.message : 'No fue posible guardar sus datos'),
  });

  return (
    <form onSubmit={handleSubmit((v) => guardar.mutate(v))} noValidate className="space-y-6">
      <Pasos pasos={PASOS} actual={0} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Sus datos</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Solo pedimos los datos necesarios para su ingreso.</p>
      </div>
      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}

      <Campo etiqueta="Nombre completo" autoComplete="name" error={errors.nombreCompleto?.message} {...register('nombreCompleto')} />
      <Selector etiqueta="Tipo de documento" opciones={OPCIONES_DOCUMENTO} error={errors.tipoDocumento?.message} {...register('tipoDocumento')} />
      <Campo
        etiqueta="Número de documento"
        inputMode="numeric"
        autoComplete="off"
        ayuda="Debe coincidir con el documento físico que presentará en recepción."
        error={errors.numeroDocumento?.message}
        {...register('numeroDocumento')}
      />
      <Campo etiqueta="Empresa" autoComplete="organization" error={errors.empresa?.message} {...register('empresa')} />
      <Campo etiqueta="Correo electrónico" type="email" autoComplete="email" error={errors.correo?.message} {...register('correo')} />
      <Campo etiqueta="Teléfono" pista="Opcional" type="tel" autoComplete="tel" error={errors.telefono?.message} {...register('telefono')} />

      <Boton type="submit" bloque tamano="xl" cargando={guardar.isPending}>
        Continuar
      </Boton>
    </form>
  );
}
