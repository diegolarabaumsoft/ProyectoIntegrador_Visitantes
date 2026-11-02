'use client';

import { ArrowLeftIcon, CalendarDaysIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { Insignia, InsigniaEstadoVisita } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { aDatetimeLocal, formatearFechaHora } from '@/lib/fechas';
import { clavesInvitaciones, invitacionesApi } from '@/services/invitaciones';

const NOMBRE_EVENTO: Record<string, string> = {
  INVITACION_CREADA: 'Invitación creada',
  INVITACION_REPROGRAMADA: 'Invitación reprogramada',
  INVITACION_CANCELADA: 'Invitación cancelada',
  ENLACE_ENVIADO: 'Enlace reenviado',
  NOTIFICACION_ENVIADA: 'Correo enviado',
  NOTIFICACION_FALLIDA: 'Correo fallido',
  PRE_REGISTRO_DATOS: 'Datos del visitante registrados',
  CONSENTIMIENTO_ACEPTADO: 'Consentimiento y NDA aceptados',
  INDUCCION_APROBADA: 'Inducción aprobada',
  INDUCCION_REPROBADA: 'Inducción no aprobada',
  PRE_REGISTRO_COMPLETADO: 'Pre-registro completado',
  CREDENCIAL_EMITIDA: 'Credencial QR emitida',
  CREDENCIAL_INVALIDADA: 'Credencial invalidada',
  CHECKIN_REALIZADO: 'Ingreso registrado',
  CHECKOUT_REALIZADO: 'Salida registrada',
};

/** A4 · Detalle de invitación con línea de tiempo (bitácora). */
export function DetalleInvitacion({ id }: { id: string }) {
  const notificar = useNotificar();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<'reprogramar' | 'cancelar' | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [visitaSeleccionada, setVisitaSeleccionada] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({ queryKey: clavesInvitaciones.detalle(id), queryFn: () => invitacionesApi.detalle(id) });

  const visitaActiva = visitaSeleccionada ?? data?.visitas[0]?.id ?? null;
  const bitacora = useQuery({
    queryKey: clavesInvitaciones.bitacora(visitaActiva ?? ''),
    queryFn: () => invitacionesApi.bitacoraVisita(visitaActiva!),
    enabled: Boolean(visitaActiva),
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['invitaciones'] });
    void queryClient.invalidateQueries({ queryKey: ['bitacora'] });
  };

  const reprogramar = useMutation({
    mutationFn: () => invitacionesApi.reprogramar(id, new Date(nuevaFecha).toISOString()),
    onSuccess: () => {
      notificar.exito('Visita reprogramada', 'Los visitantes recibieron un correo con la nueva fecha.');
      setModal(null);
      invalidar();
    },
    onError: (e) => notificar.error('No se pudo reprogramar', e instanceof ApiError ? e.message : undefined),
  });

  const cancelar = useMutation({
    mutationFn: () => invitacionesApi.cancelar(id),
    onSuccess: () => {
      notificar.exito('Invitación cancelada', 'Las credenciales quedaron sin efecto y se notificó a los visitantes.');
      setModal(null);
      invalidar();
    },
    onError: (e) => notificar.error('No se pudo cancelar', e instanceof ApiError ? e.message : undefined),
  });

  const reenviar = useMutation({
    mutationFn: (visitaId: string) => invitacionesApi.reenviarEnlace(visitaId),
    onSuccess: (fila) => {
      notificar.exito('Enlace reenviado', `${fila.visitante.nombreCompleto} recibirá un nuevo correo.`);
      invalidar();
    },
    onError: (e) => notificar.error('No se pudo reenviar', e instanceof ApiError ? e.message : undefined),
  });

  if (error) {
    return (
      <Alerta tipo="error" titulo="No se pudo cargar la invitación">
        {error instanceof ApiError ? error.message : 'Intente de nuevo.'}
      </Alerta>
    );
  }
  if (isPending || !data) return <Cargando />;

  const editable = data.estado !== 'CANCELADA' && data.visitas.some((v) => v.estado === 'PROGRAMADA' || v.estado === 'PRE_REGISTRADA');

  return (
    <div className="space-y-6">
      <Boton href="/anfitrion" variante="enlace" iconoInicio={ArrowLeftIcon}>
        Mis visitas
      </Boton>
      <EncabezadoPagina
        titulo={data.esGrupal ? `Visita grupal · ${data.visitas.length} visitantes` : (data.visitas[0]?.visitante.nombreCompleto ?? 'Invitación')}
        descripcion={`${formatearFechaHora(data.fechaVisita)} · ${data.motivo}`}
        acciones={
          editable ? (
            <>
              <Boton
                variante="secundario"
                iconoInicio={CalendarDaysIcon}
                onClick={() => {
                  setNuevaFecha(aDatetimeLocal(new Date(data.fechaVisita)));
                  setModal('reprogramar');
                }}
              >
                Reprogramar
              </Boton>
              <Boton variante="peligro" onClick={() => setModal('cancelar')}>
                Cancelar invitación
              </Boton>
            </>
          ) : (
            <Insignia color={data.estado === 'CANCELADA' ? 'amarillo' : 'gris'}>{data.estado === 'CANCELADA' ? 'Cancelada' : 'Sin cambios disponibles'}</Insignia>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="Visitantes" descripcion="Estado del pre-registro de cada persona." sinRelleno>
            <ul role="list" className="divide-y divide-gray-100 dark:divide-white/5">
              {data.visitas.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-sm/6 font-semibold text-gray-900 dark:text-white">{v.visitante.nombreCompleto}</p>
                    <p className="truncate text-xs/5 text-gray-500 dark:text-gray-400">
                      {v.visitante.empresa} · {v.visitante.correo}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <InsigniaEstadoVisita estado={v.estado} />
                    {v.credencialEmitida ? <Insignia color="verde">QR emitido</Insignia> : v.preRegistroCompleto ? <Insignia color="azul">Consentimiento</Insignia> : null}
                    {(v.estado === 'PROGRAMADA' || v.estado === 'PRE_REGISTRADA') && (
                      <Boton variante="secundario" tamano="md" onClick={() => reenviar.mutate(v.id)} cargando={reenviar.isPending && reenviar.variables === v.id}>
                        Reenviar enlace
                      </Boton>
                    )}
                    <button
                      type="button"
                      onClick={() => setVisitaSeleccionada(v.id)}
                      className={`text-sm font-medium ${visitaActiva === v.id ? 'text-gray-400 dark:text-gray-500' : 'text-indigo-600 hover:text-indigo-500 dark:text-indigo-400'}`}
                    >
                      {visitaActiva === v.id ? 'Historial visible' : 'Ver historial'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Tarjeta>

          <Tarjeta titulo="Historial" descripcion="Eventos registrados en la bitácora para el visitante seleccionado." sinRelleno>
            {bitacora.isPending ? (
              <Cargando texto="Cargando historial…" />
            ) : bitacora.data && bitacora.data.length > 0 ? (
              <ul role="list" className="divide-y divide-gray-100 dark:divide-white/5">
                {bitacora.data.map((e) => (
                  <li key={e.id} className="flex gap-x-4 px-4 py-3 sm:px-6">
                    <div className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm/6 text-gray-900 dark:text-white">
                        <span className="font-medium">{NOMBRE_EVENTO[e.tipoEvento] ?? e.tipoEvento}</span>
                        <span className="text-gray-500 dark:text-gray-400"> · {e.resultado}</span>
                      </p>
                      <p className="text-xs/5 text-gray-500 dark:text-gray-400">
                        {formatearFechaHora(e.fechaHora)} · {e.actor}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Sin eventos todavía.</p>
            )}
          </Tarjeta>
        </div>

        <Tarjeta titulo="Invitación" sinRelleno>
          <ListaDescripcion
            compacta
            items={[
              { termino: 'Fecha y hora', valor: formatearFechaHora(data.fechaVisita) },
              { termino: 'Motivo', valor: data.motivo },
              { termino: 'Permanencia', valor: `${data.visitas[0]?.tiempoAutorizadoMin ?? 0} min` },
              { termino: 'Anfitrión', valor: `${data.anfitrion.nombre}${data.anfitrion.area ? ` · ${data.anfitrion.area}` : ''}` },
              { termino: 'Creada', valor: formatearFechaHora(data.createdAt) },
              {
                termino: 'Enlace válido hasta',
                valor: data.visitas[0]?.vencimientoEnlace ? formatearFechaHora(data.visitas[0].vencimientoEnlace) : '—',
              },
            ]}
          />
        </Tarjeta>
      </div>

      <Modal
        abierto={modal === 'reprogramar'}
        onCerrar={() => setModal(null)}
        titulo="Reprogramar visita"
        descripcion="Las credenciales emitidas quedarán sin efecto y cada visitante recibirá un correo con la nueva fecha."
        icono={CalendarDaysIcon}
        acciones={
          <>
            <Boton onClick={() => reprogramar.mutate()} cargando={reprogramar.isPending} disabled={!nuevaFecha}>
              Confirmar nueva fecha
            </Boton>
            <Boton variante="secundario" onClick={() => setModal(null)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <Campo etiqueta="Nueva fecha y hora" type="datetime-local" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
      </Modal>

      <Modal
        abierto={modal === 'cancelar'}
        onCerrar={() => setModal(null)}
        titulo="Cancelar invitación"
        descripcion="Las visitas pasarán a estado Cancelada, las credenciales quedarán sin efecto y se notificará a los visitantes. Esta acción no se puede deshacer."
        icono={ExclamationTriangleIcon}
        tonoIcono="rojo"
        acciones={
          <>
            <Boton variante="peligro" onClick={() => cancelar.mutate()} cargando={cancelar.isPending}>
              Sí, cancelar
            </Boton>
            <Boton variante="secundario" onClick={() => setModal(null)}>
              Volver
            </Boton>
          </>
        }
      />
    </div>
  );
}
