'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { AreaTexto, Campo } from '@/components/ui/campo';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { Tarjeta, ListaDescripcion } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFecha, formatearFechaHora, formatearHora } from '@/lib/fechas';
import { checkInApi, clavesCheckIn, type FichaVisitante } from '@/services/check-in';

/** R3a · Ingreso autorizado. Adaptado de Tailwind Plus · layout/cards y data-display/description-lists. */
export function ResultadoAutorizado({ ficha, selloTiempo, onSiguiente }: { ficha: FichaVisitante; selloTiempo: string; onSiguiente: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <Insignia color="verde">Autorizado</Insignia>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{ficha.visitante.nombreCompleto} puede ingresar</h1>
      <Tarjeta sinRelleno className="text-left">
        <ListaDescripcion
          items={[
            { termino: 'Hora de ingreso', valor: formatearHora(selloTiempo) },
            { termino: 'Anfitrión notificado', valor: ficha.anfitrion.nombre },
          ]}
        />
      </Tarjeta>
      <p className="text-sm text-gray-500 dark:text-gray-400">El evento quedó registrado en la bitácora.</p>
      <Boton tamano="xl" bloque onClick={onSiguiente}>
        Siguiente visitante
      </Boton>
    </div>
  );
}

/** R3b · Ingreso en modo de contingencia. */
export function ResultadoContingencia({ ficha, selloTiempo, motivo, onSiguiente }: { ficha: FichaVisitante; selloTiempo: string; motivo?: string; onSiguiente: () => void }) {
  const confirmar = useMutation({ mutationFn: () => checkInApi.contingencia(ficha.visita.id) });
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <Insignia color="amarillo">Contingencia</Insignia>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">El torniquete no respondió</h1>
      <Tarjeta titulo="Habilite el paso manualmente" className="text-left">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Abra el torniquete con la llave de contingencia.</li>
          <li>Deje pasar únicamente a {ficha.visitante.nombreCompleto}.</li>
          <li>Confirme el paso con el botón de abajo.</li>
        </ol>
        {motivo ? <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{motivo}</p> : null}
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sello de tiempo: {formatearFechaHora(selloTiempo)}</p>
      </Tarjeta>
      <p className="text-sm text-gray-500 dark:text-gray-400">El evento se registró con sello de tiempo y la autorización quedó en cola.</p>
      {confirmar.isError ? <Alerta tipo="error">{confirmar.error instanceof ApiError ? confirmar.error.message : 'No fue posible registrar el paso manual'}</Alerta> : null}
      {confirmar.isSuccess ? (
        <>
          <Alerta tipo="exito">Paso manual registrado · {formatearHora(confirmar.data.pasoManualEn)}</Alerta>
          <Boton tamano="xl" bloque onClick={onSiguiente}>
            Siguiente visitante
          </Boton>
        </>
      ) : (
        <Boton tamano="xl" bloque cargando={confirmar.isPending} onClick={() => confirmar.mutate()}>
          Confirmar paso manual
        </Boton>
      )}
    </div>
  );
}

const schemaExcepcion = z.object({
  justificacion: z.string().trim().min(5, 'Explique la justificación (mínimo 5 caracteres)'),
  autorizadoPor: z.string().trim().min(3, 'Indique nombre y cargo de quien autoriza'),
});
type FormExcepcion = z.infer<typeof schemaExcepcion>;

/** R4 · Ingreso bloqueado y R5 · Registrar excepción. Adaptado de Tailwind Plus · overlays/modal-dialogs. */
export function ResultadoBloqueado({ ficha, onCerrar, onExcepcion }: { ficha: FichaVisitante; onCerrar: () => void; onExcepcion: (visitaId: string) => void }) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const { restriccion } = ficha.requisitos;
  const { register, handleSubmit, formState: { errors } } = useForm<FormExcepcion>({
    resolver: zodResolver(schemaExcepcion),
    defaultValues: { justificacion: '', autorizadoPor: '' },
  });
  const registrar = useMutation({
    mutationFn: (valores: FormExcepcion) => checkInApi.excepcion(ficha.visita.id, valores),
    onSuccess: (actualizada) => {
      queryClient.setQueryData(clavesCheckIn.ficha(ficha.visita.id), actualizada);
      onExcepcion(ficha.visita.id);
    },
  });

  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <Insignia color="rojo">Bloqueado</Insignia>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coincidencia en la lista de restricción</h1>
      <Tarjeta sinRelleno className="text-left">
        <ListaDescripcion
          items={[
            { termino: 'Visitante', valor: ficha.visitante.nombreCompleto },
            { termino: 'Motivo', valor: restriccion.motivo ?? '—' },
            { termino: 'Fecha de registro', valor: restriccion.fechaRegistro ? formatearFecha(restriccion.fechaRegistro) : '—' },
          ]}
        />
      </Tarjeta>
      <p className="text-sm text-gray-500 dark:text-gray-400">Se notificó a Seguridad y al DPO. Solo el jefe de seguridad puede autorizar una excepción.</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
        <Boton variante="peligro" onClick={() => setModal(true)}>
          Registrar excepción autorizada
        </Boton>
      </div>

      <Modal
        abierto={modal}
        onCerrar={() => setModal(false)}
        titulo="Registrar excepción autorizada"
        descripcion={`${ficha.visitante.nombreCompleto} · documento ${ficha.visitante.numeroDocumento}`}
        icono={ExclamationTriangleIcon}
        tonoIcono="amarillo"
        acciones={
          <>
            <Boton type="submit" form="form-excepcion" cargando={registrar.isPending}>
              Registrar y continuar
            </Boton>
            <Boton variante="secundario" onClick={() => setModal(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <form id="form-excepcion" onSubmit={handleSubmit((v) => registrar.mutate(v))} className="space-y-4">
          <AreaTexto etiqueta="Justificación" {...register('justificacion')} error={errors.justificacion?.message} />
          <Campo etiqueta="Autorizado por (nombre y cargo)" {...register('autorizadoPor')} error={errors.autorizadoPor?.message} />
          <Alerta tipo="advertencia">La excepción aplica solo a esta visita y queda en la bitácora.</Alerta>
          {registrar.isError ? <Alerta tipo="error">{registrar.error instanceof ApiError ? registrar.error.message : 'No fue posible registrar la excepción'}</Alerta> : null}
        </form>
      </Modal>
    </div>
  );
}
