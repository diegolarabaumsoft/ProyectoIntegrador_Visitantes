'use client';

/** AD1 · Tablero de KPI. Adaptado de Tailwind Plus · data-display/stats; el gráfico son barras de Tailwind, sin librerías. */

import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Estadisticas } from '@/components/ui/estadisticas';
import { Insignia } from '@/components/ui/insignia';
import { useNotificar } from '@/components/ui/notificaciones';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearDuracion, formatearFecha, formatearFechaHora } from '@/lib/fechas';
import { clavesKpi, kpiApi } from '@/services/kpi';

const META_CHECKIN_S = 180;
const META_ENROLADO_S = 60;
const hoyBogota = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
const duracion = (s: number) => (s < 60 ? `${s} s` : formatearDuracion(s / 60));

export function TableroKpi({ esAdministrador }: { esAdministrador: boolean }) {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const { data, isPending, error } = useQuery({ queryKey: clavesKpi.tablero, queryFn: kpiApi.tablero });
  const recalcular = useMutation({
    mutationFn: () => kpiApi.recalcular(hoyBogota()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesKpi.tablero });
      notificar.exito('Indicadores recalculados', 'Se calcularon con los datos de hoy.');
    },
    onError: (e) => notificar.error('No se pudo recalcular', e instanceof ApiError ? e.message : undefined),
  });

  const botonRecalcular = esAdministrador ? (
    <Boton variante="secundario" iconoInicio={ArrowPathIcon} cargando={recalcular.isPending} onClick={() => recalcular.mutate()}>
      Calcular hoy
    </Boton>
  ) : null;
  const v = data?.valores ?? {};
  const promedio = v.TIEMPO_CHECKIN_PROMEDIO ?? 0;
  const maximo = Math.max(1, ...(data?.serie ?? []).map((s) => s.valor));

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Tablero de indicadores" descripcion={data?.calculadoEn ? `Datos actualizados el ${formatearFechaHora(data.calculadoEn)}` : undefined} acciones={botonRecalcular} />
      {error ? <Alerta tipo="error" titulo="No se pudo cargar el tablero">{error instanceof ApiError ? error.message : undefined}</Alerta> : null}
      {isPending ? <Esqueleto lineas={6} /> : null}
      {data && !data.periodo ? <EstadoVacio icono={ChartBarIcon} titulo="Aún no hay indicadores" descripcion="Se calculan cada día a las 6:00 a. m." accion={botonRecalcular} /> : null}
      {data?.periodo ? (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">Indicadores del {formatearFecha(`${data.periodo}T12:00:00-05:00`)}</p>
          <Estadisticas
            items={[
              { nombre: 'Tiempo promedio de check-in', valor: duracion(promedio), detalle: <Insignia color={promedio <= META_CHECKIN_S ? 'verde' : 'rojo'}>Meta: 3 min</Insignia> },
              { nombre: 'Completitud del registro', valor: `${v.COMPLETITUD_REGISTRO ?? 0} %` },
              { nombre: 'Satisfacción del visitante', valor: v.SATISFACCION !== undefined ? `${v.SATISFACCION} / 5` : '—', detalle: v.SATISFACCION === undefined ? 'Sin respuestas ese día' : undefined },
              { nombre: 'Visitas del día', valor: v.VISITAS_DIA ?? 0, detalle: `${v.BLOQUEOS ?? 0} bloqueos · ${v.CONTINGENCIAS ?? 0} contingencias` },
            ]}
          />
          <Estadisticas
            items={[
              { nombre: 'Rechazo biométrico', valor: v.TASA_RECHAZO_BIOMETRICO !== undefined ? `${v.TASA_RECHAZO_BIOMETRICO} %` : '—', detalle: v.TASA_RECHAZO_BIOMETRICO === undefined ? 'Sin lecturas ese día' : 'Lecturas rechazadas en recepción' },
              {
                nombre: 'Huella enrolada (p90)',
                valor: v.TIEMPO_CHECKIN_P90_ENROLADO !== undefined ? duracion(v.TIEMPO_CHECKIN_P90_ENROLADO) : '—',
                detalle: v.TIEMPO_CHECKIN_P90_ENROLADO === undefined ? 'Sin ingresos ese día' : <Insignia color={v.TIEMPO_CHECKIN_P90_ENROLADO <= META_ENROLADO_S ? 'verde' : 'rojo'}>Meta: 1 min</Insignia>,
              },
              {
                nombre: 'Con enrolamiento (p90)',
                valor: v.TIEMPO_CHECKIN_P90_PRIMERA_VISITA !== undefined ? duracion(v.TIEMPO_CHECKIN_P90_PRIMERA_VISITA) : '—',
                detalle: v.TIEMPO_CHECKIN_P90_PRIMERA_VISITA === undefined ? 'Sin ingresos ese día' : <Insignia color={v.TIEMPO_CHECKIN_P90_PRIMERA_VISITA <= META_CHECKIN_S ? 'verde' : 'rojo'}>Meta: 3 min</Insignia>,
              },
            ]}
          />
          <Tarjeta titulo="Visitas por día · últimos 7 días">
            <div className="flex h-48 items-end gap-3">
              {data.serie.map((s) => (
                <div key={s.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">{s.valor}</span>
                  <div className="w-full rounded-t bg-indigo-600 dark:bg-indigo-500" style={{ height: `${(s.valor / maximo) * 80}%`, minHeight: 2 }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{s.dia.slice(5)}</span>
                </div>
              ))}
            </div>
          </Tarjeta>
        </>
      ) : null}
      {esAdministrador ? (
        <div className="flex flex-wrap gap-3">
          <Boton variante="secundario" href="/admin/reportes">
            Generar reporte
          </Boton>
          <Boton variante="secundario" href="/admin/reportes">
            Exportar datos anonimizados
          </Boton>
          <Boton variante="secundario" href="/admin/alertas">
            Configurar alertas por umbral
          </Boton>
        </div>
      ) : null}
    </div>
  );
}
