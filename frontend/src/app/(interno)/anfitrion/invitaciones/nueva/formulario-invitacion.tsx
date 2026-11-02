'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { Insignia } from '@/components/ui/insignia';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { aDatetimeLocal, formatearFechaHora, mananaALas9 } from '@/lib/fechas';
import { invitacionesApi, type RespuestaCrear } from '@/services/invitaciones';
import { NOMBRE_TIPO_DOCUMENTO, type TipoDocumento } from '@/types/api';

const visitanteSchema = z.object({
  nombreCompleto: z.string().trim().min(3, 'Ingrese el nombre completo').max(120),
  correo: z.string().trim().email('Ingrese un correo válido'),
  empresa: z.string().trim().min(2, 'Ingrese la empresa').max(120),
  tipoDocumento: z.enum(['CC', 'CE', 'PASAPORTE', 'OTRO']).optional(),
  numeroDocumento: z.string().trim().max(30).optional(),
});

const esquema = z.object({
  fechaVisita: z.string().min(1, 'Seleccione fecha y hora'),
  tiempoAutorizadoMin: z.string().min(1, 'Seleccione la permanencia autorizada'),
  motivo: z.string().trim().min(3, 'Indique el motivo de la visita').max(200),
  visitantes: z.array(visitanteSchema).min(1, 'Agregue al menos un visitante').max(25),
});

type Valores = z.infer<typeof esquema>;

const OPCIONES_DOCUMENTO = (Object.keys(NOMBRE_TIPO_DOCUMENTO) as TipoDocumento[]).map((v) => ({ valor: v, texto: NOMBRE_TIPO_DOCUMENTO[v] }));
const OPCIONES_DURACION = [60, 120, 180, 240, 360, 480].map((m) => ({ valor: String(m), texto: m < 60 ? `${m} min` : `${m / 60} h` }));

const visitanteVacio = { nombreCompleto: '', correo: '', empresa: '', tipoDocumento: 'CC' as const, numeroDocumento: '' };

/** A2 · Nueva invitación y A3 · Invitación enviada. Adaptado de Tailwind Plus · forms/form-layouts (stacked). */
export function FormularioInvitacion() {
  const [resultado, setResultado] = useState<RespuestaCrear | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { fechaVisita: aDatetimeLocal(mananaALas9()), tiempoAutorizadoMin: '240', motivo: '', visitantes: [visitanteVacio] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'visitantes' });
  const { errors } = form.formState;
  const errorVisitantes = errors.visitantes?.root?.message ?? (typeof errors.visitantes?.message === 'string' ? errors.visitantes.message : undefined);

  const crear = useMutation({
    mutationFn: (valores: Valores) =>
      invitacionesApi.crear({
        fechaVisita: new Date(valores.fechaVisita).toISOString(),
        motivo: valores.motivo,
        tiempoAutorizadoMin: Number(valores.tiempoAutorizadoMin),
        visitantes: valores.visitantes.map((v) => ({
          ...v,
          numeroDocumento: v.numeroDocumento || undefined,
          tipoDocumento: v.numeroDocumento ? v.tipoDocumento : undefined,
        })),
      }),
    onSuccess: (r) => {
      setResultado(r);
      setErrorGeneral(null);
      window.scrollTo({ top: 0 });
    },
    onError: (e) => setErrorGeneral(e instanceof ApiError ? e.message : 'No fue posible crear la invitación'),
  });

  if (resultado) {
    const primera = resultado.visitas[0];
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <CheckCircleIcon aria-hidden="true" className="mx-auto size-12 text-green-500" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Enlace de pre-registro enviado</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {resultado.visitas.length === 1
              ? 'El visitante recibirá un correo con el enlace para completar su pre-registro.'
              : `Cada uno de los ${resultado.visitas.length} visitantes recibirá su propio enlace de pre-registro.`}
          </p>
        </div>
        <Tarjeta sinRelleno>
          <ListaDescripcion
            items={[
              { termino: 'Fecha y hora', valor: formatearFechaHora(primera.fechaProgramada) },
              { termino: 'Motivo', valor: primera.motivo },
              {
                termino: resultado.visitas.length === 1 ? 'Visitante' : 'Visitantes',
                valor: (
                  <ul className="space-y-1">
                    {resultado.visitas.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {v.visitante.nombreCompleto} · {v.visitante.empresa}
                        </span>
                        <Insignia color="azul" punto={false}>
                          {v.visitante.correo}
                        </Insignia>
                      </li>
                    ))}
                  </ul>
                ),
              },
              { termino: 'Enlace válido hasta', valor: primera.vencimientoEnlace ? formatearFechaHora(primera.vencimientoEnlace) : '—' },
            ]}
          />
        </Tarjeta>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Boton href="/anfitrion" variante="secundario">
            Ver mis visitas
          </Boton>
          <Boton
            onClick={() => {
              setResultado(null);
              form.reset({ fechaVisita: aDatetimeLocal(mananaALas9()), tiempoAutorizadoMin: '240', motivo: '', visitantes: [visitanteVacio] });
            }}
            iconoInicio={PlusIcon}
          >
            Crear otra invitación
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => crear.mutate(v))} noValidate className="mx-auto max-w-3xl space-y-8">
      <EncabezadoPagina
        titulo="Nueva invitación"
        descripcion="Complete los datos del visitante. Se le enviará un enlace seguro de pre-registro por correo."
      />

      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}

      <Tarjeta titulo="Visita" descripcion="Fecha, duración autorizada y motivo.">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-6">
          <Campo
            etiqueta="Fecha y hora"
            type="datetime-local"
            className="sm:col-span-3"
            error={errors.fechaVisita?.message}
            {...form.register('fechaVisita')}
          />
          <Selector
            etiqueta="Permanencia autorizada"
            opciones={OPCIONES_DURACION}
            className="sm:col-span-3"
            error={errors.tiempoAutorizadoMin?.message}
            {...form.register('tiempoAutorizadoMin')}
          />
          <Campo
            etiqueta="Motivo de la visita"
            placeholder="Revisión de materia prima"
            className="sm:col-span-6"
            error={errors.motivo?.message}
            {...form.register('motivo')}
          />
        </div>
      </Tarjeta>

      {fields.map((campo, i) => (
        <Tarjeta
          key={campo.id}
          titulo={`Visitante ${i + 1}`}
          descripcion={i === 0 ? 'Datos básicos; el visitante completará el resto en su pre-registro.' : undefined}
          acciones={
            fields.length > 1 ? (
              <Boton variante="secundario" tamano="md" iconoInicio={TrashIcon} onClick={() => remove(i)}>
                Quitar
              </Boton>
            ) : null
          }
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-6">
            <Campo
              etiqueta="Nombre completo"
              autoComplete="off"
              className="sm:col-span-3"
              error={errors.visitantes?.[i]?.nombreCompleto?.message}
              {...form.register(`visitantes.${i}.nombreCompleto`)}
            />
            <Campo
              etiqueta="Correo electrónico"
              type="email"
              autoComplete="off"
              className="sm:col-span-3"
              error={errors.visitantes?.[i]?.correo?.message}
              {...form.register(`visitantes.${i}.correo`)}
            />
            <Campo
              etiqueta="Empresa"
              className="sm:col-span-6"
              error={errors.visitantes?.[i]?.empresa?.message}
              {...form.register(`visitantes.${i}.empresa`)}
            />
            <Selector
              etiqueta="Tipo de documento"
              pista="Opcional"
              opciones={OPCIONES_DOCUMENTO}
              className="sm:col-span-2"
              {...form.register(`visitantes.${i}.tipoDocumento`)}
            />
            <Campo
              etiqueta="Número de documento"
              pista="Opcional"
              ayuda="Si lo conoce, agiliza la verificación contra la lista de restricción."
              className="sm:col-span-4"
              error={errors.visitantes?.[i]?.numeroDocumento?.message}
              {...form.register(`visitantes.${i}.numeroDocumento`)}
            />
          </div>
        </Tarjeta>
      ))}

      {errorVisitantes ? <Alerta tipo="error">{errorVisitantes}</Alerta> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Boton variante="suave" iconoInicio={PlusIcon} onClick={() => append(visitanteVacio)} disabled={fields.length >= 25}>
          Agregar otro visitante
        </Boton>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Boton href="/anfitrion" variante="secundario">
            Cancelar
          </Boton>
          <Boton type="submit" cargando={crear.isPending}>
            Enviar invitación
          </Boton>
        </div>
      </div>
    </form>
  );
}
