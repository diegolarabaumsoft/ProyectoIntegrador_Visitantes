'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { AreaTexto, Campo, Selector } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { Casilla } from '@/components/ui/casilla';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { checkInApi, clavesCheckIn, type ResultadoExpres } from '@/services/check-in';
import { NOMBRE_TIPO_DOCUMENTO, type TipoDocumento } from '@/types/api';

const schema = z.object({
  nombreCompleto: z.string().trim().min(3, 'Indique el nombre completo'),
  tipoDocumento: z.enum(['CC', 'CE', 'PASAPORTE', 'OTRO']),
  numeroDocumento: z.string().trim().regex(/^[A-Za-z0-9.\-\s]{5,30}$/, 'El número de documento no es válido'),
  empresa: z.string().trim().min(2, 'Indique la empresa'),
  correo: z.union([z.literal(''), z.string().trim().email('El correo no es válido')]),
  anfitrionId: z.string().min(1, 'Seleccione el anfitrión'),
  motivo: z.string().trim().min(3, 'Indique el motivo'),
  aceptaTratamiento: z.boolean().refine(Boolean, 'El visitante debe aceptar el tratamiento de datos'),
  aceptaNda: z.boolean().refine(Boolean, 'El visitante debe aceptar el acuerdo de confidencialidad'),
  autorizaBiometria: z.boolean(),
});
type Formulario = z.infer<typeof schema>;

const TIPOS = (Object.keys(NOMBRE_TIPO_DOCUMENTO) as TipoDocumento[]).map((valor) => ({ valor, texto: NOMBRE_TIPO_DOCUMENTO[valor] }));

/** R8 · Registro exprés (HU-11). Adaptado de Tailwind Plus · forms/form-layouts (stacked). */
export function FormularioExpres({ onCancelar, onCreada }: { onCancelar: () => void; onCreada: (r: ResultadoExpres) => void }) {
  const { data: catalogos, isPending, error } = useQuery({ queryKey: clavesCheckIn.catalogos, queryFn: checkInApi.catalogos });
  const { register, handleSubmit, formState: { errors } } = useForm<Formulario>({
    resolver: zodResolver(schema),
    defaultValues: { nombreCompleto: '', tipoDocumento: 'CC', numeroDocumento: '', empresa: '', correo: '', anfitrionId: '', motivo: '', aceptaTratamiento: false, aceptaNda: false, autorizaBiometria: false },
  });
  const crear = useMutation({
    mutationFn: ({ correo, ...v }: Formulario) => checkInApi.expres({ ...v, ...(correo ? { correo } : {}), aceptaTratamiento: true, aceptaNda: true }),
    onSuccess: onCreada,
  });

  if (error) return <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo cargar el formulario.'}</Alerta>;
  if (isPending || !catalogos) return <Cargando />;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Registro exprés" descripcion="Para visitas no planificadas. La verificación de la lista de restricción es obligatoria." />
      <form onSubmit={handleSubmit((v) => crear.mutate(v))}>
        <Tarjeta
          pie={
            <div className="flex justify-end gap-3">
              <Boton variante="secundario" onClick={onCancelar}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={crear.isPending}>
                Crear y continuar
              </Boton>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre completo" {...register('nombreCompleto')} error={errors.nombreCompleto?.message} />
            <Campo etiqueta="Empresa" {...register('empresa')} error={errors.empresa?.message} />
            <Selector etiqueta="Tipo de documento" opciones={TIPOS} {...register('tipoDocumento')} error={errors.tipoDocumento?.message} />
            <Campo etiqueta="Número de documento" {...register('numeroDocumento')} error={errors.numeroDocumento?.message} />
            <Selector
              etiqueta="Anfitrión"
              marcador="Seleccione…"
              opciones={catalogos.anfitriones.map((a) => ({ valor: a.id, texto: a.area ? `${a.nombre} · ${a.area}` : a.nombre }))}
              {...register('anfitrionId')}
              error={errors.anfitrionId?.message}
            />
            <Campo etiqueta="Correo" pista="Opcional" type="email" {...register('correo')} error={errors.correo?.message} />
            <AreaTexto className="sm:col-span-2" etiqueta="Motivo de la visita" {...register('motivo')} error={errors.motivo?.message} />
          </div>
          <div className="mt-6 space-y-4">
            <Casilla etiqueta="Autorizo el tratamiento de mis datos personales" descripcion="Firmado por el visitante en recepción." {...register('aceptaTratamiento')} error={errors.aceptaTratamiento?.message} />
            <Casilla etiqueta="Acepto el acuerdo de confidencialidad" {...register('aceptaNda')} error={errors.aceptaNda?.message} />
            <Casilla
              etiqueta="Autorizo el tratamiento de mi huella dactilar (opcional)"
              descripcion="Dato sensible y facultativo. Si no la autoriza, ingresa con credencial alternativa y las mismas validaciones. La huella se registra en el siguiente paso."
              {...register('autorizaBiometria')}
            />
          </div>
          {crear.isError ? (
            <Alerta tipo="error" className="mt-4">
              {crear.error instanceof ApiError ? crear.error.message : 'No fue posible crear el registro'}
            </Alerta>
          ) : null}
        </Tarjeta>
      </form>
    </div>
  );
}
