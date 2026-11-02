'use client';

import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useQuery } from '@tanstack/react-query';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Cargando } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { InsigniaEstadoVisita } from '@/components/ui/insignia';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearDuracion, formatearFechaHora } from '@/lib/fechas';
import { NOMBRE_METODO, clavesVisitas, visitasApi } from '@/services/visitas';
import { NOMBRE_EPP, NOMBRE_TIPO_DOCUMENTO } from '@/types/api';

const fh = (v: string | null | undefined) => (v ? formatearFechaHora(v) : '—');

/** AD8 · Detalle de visita. Adaptado de Tailwind Plus · data-display/description-lists y lists/feeds. */
export function DetalleVisita({ id }: { id: string }) {
  const { data: v, isPending, error } = useQuery({ queryKey: clavesVisitas.detalle(id), queryFn: () => visitasApi.detalle(id) });
  if (error) return <Alerta tipo="error" titulo="No se pudo cargar la visita">{error instanceof ApiError ? error.message : undefined}</Alerta>;
  if (isPending || !v) return <Cargando texto="Cargando visita…" />;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={v.visitante.nombreCompleto}
        descripcion={<InsigniaEstadoVisita estado={v.estado} />}
        acciones={
          <Boton variante="secundario" iconoInicio={ArrowLeftIcon} href="/admin/historico">
            Volver
          </Boton>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Visitante" sinRelleno>
          <ListaDescripcion
            items={[
              { termino: 'Documento', valor: `${NOMBRE_TIPO_DOCUMENTO[v.visitante.tipoDocumento]} · ${v.visitante.numeroDocumento}` },
              { termino: 'Empresa', valor: v.visitante.empresa },
              { termino: 'Anfitrión', valor: v.anfitrion.area ? `${v.anfitrion.nombre} · ${v.anfitrion.area}` : v.anfitrion.nombre },
              { termino: 'Acompañante', valor: v.acompanante ?? '—' },
              { termino: 'Vehículo', valor: v.vehiculo ? [v.vehiculo.placa, v.vehiculo.tipo].filter(Boolean).join(' · ') : '—' },
            ]}
          />
        </Tarjeta>
        <Tarjeta titulo="Visita" sinRelleno>
          <ListaDescripcion
            items={[
              { termino: 'Motivo', valor: v.motivo },
              { termino: 'Programada', valor: fh(v.fechaProgramada) },
              { termino: 'Ingreso', valor: fh(v.horaIngreso) },
              { termino: 'Salida', valor: fh(v.horaSalida) },
              { termino: 'Autorizado', valor: formatearDuracion(v.tiempoAutorizadoMin) },
              { termino: 'Identificación', valor: v.metodoIdentificacion ? NOMBRE_METODO[v.metodoIdentificacion] : '—' },
              { termino: 'Contingencia', valor: v.modoContingencia ? 'Sí' : 'No' },
              { termino: 'Satisfacción', valor: v.satisfaccion ? `${v.satisfaccion} de 5` : '—' },
            ]}
          />
        </Tarjeta>
        <Tarjeta titulo="Credencial y consentimiento" sinRelleno>
          <ListaDescripcion
            items={[
              { termino: 'Credencial', valor: v.credencial ? `${v.credencial.activa ? 'Activa' : 'Inactiva'} · vence ${fh(v.credencial.venceEn)}` : 'Sin credencial' },
              { termino: 'Credencial física', valor: v.credencial?.fisicaDevuelta ? 'Devuelta' : v.credencial?.fisicaEntregada ? 'Entregada, sin devolver' : 'No entregada' },
              { termino: 'Consentimiento', valor: v.consentimiento ? `Política ${v.consentimiento.versionPolitica} · ${fh(v.consentimiento.fechaHoraAceptacion)}` : 'Sin consentimiento' },
            ]}
          />
        </Tarjeta>
        <Tarjeta titulo="EPP y movimientos">
          {v.epp.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">Sin EPP registrado.</p> : null}
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {v.epp.map((e) => (
              <li key={e.elemento}>
                {NOMBRE_EPP[e.elemento]}: {e.devuelto ? 'devuelto' : e.entregado ? 'entregado, sin devolver' : 'no entregado'}
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {v.movimientos.map((m) => (
              <li key={m.id}>
                {m.zona}
                {m.esSensible ? ' (sensible)' : ''}: {fh(m.horaEntrada)} → {fh(m.horaSalida)}
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
      <Tarjeta titulo="Línea de tiempo">
        {v.eventos.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">Sin eventos.</p> : null}
        <ol className="space-y-3">
          {v.eventos.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="font-medium text-gray-900 dark:text-white">{e.resultado}</p>
              <p className="text-gray-500 dark:text-gray-400">
                {formatearFechaHora(e.fechaHora)} · {e.actor}
              </p>
            </li>
          ))}
        </ol>
      </Tarjeta>
    </div>
  );
}
