'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { DocumentTextIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { AreaTexto, Campo, Selector } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { abrirDescarga, finDiaBogota, inicioDiaBogota } from '@/services/descargas';
import { clavesKpi, kpiApi } from '@/services/kpi';

const TIPOS = [
  { valor: 'VISITAS', texto: 'Visitas' },
  { valor: 'INCIDENCIAS', texto: 'Incidencias de devolución' },
  { valor: 'KPI', texto: 'Indicadores' },
];
const PERIODOS = [
  { valor: 'DIARIA', texto: 'Diaria' },
  { valor: 'SEMANAL', texto: 'Semanal' },
  { valor: 'MENSUAL', texto: 'Mensual' },
];
const mensajeDe = (e: unknown) => (e instanceof ApiError ? e.message : undefined);

/** AD4 · Reportes y exportación. Adaptado de Tailwind Plus · forms/form-layouts y lists/tables. */
export function ReportesExportacion() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [tipo, setTipo] = useState('VISITAS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const { data: reportes, isPending, error } = useQuery({ queryKey: clavesKpi.reportes, queryFn: kpiApi.reportes });

  const generar = useMutation({
    mutationFn: () => kpiApi.generar({ tipo, desde, hasta }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesKpi.reportes });
      notificar.exito('Reporte generado');
    },
    onError: (e) => notificar.error('No se pudo generar el reporte', mensajeDe(e)),
  });
  const descargar = (ruta: string, consulta?: Record<string, string | undefined>) => abrirDescarga(ruta, consulta).catch((e: unknown) => notificar.error('No se pudo descargar', mensajeDe(e)));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Reportes y exportación"
        acciones={
          <Boton variante="secundario" iconoInicio={ArrowDownTrayIcon} onClick={() => setConfirmar(true)}>
            Exportar datos anonimizados
          </Boton>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Tarjeta
          titulo="Generar reporte"
          pie={
            <Boton disabled={!desde || !hasta} cargando={generar.isPending} onClick={() => generar.mutate()}>
              Generar CSV
            </Boton>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Selector etiqueta="Tipo" opciones={TIPOS} value={tipo} onChange={(e) => setTipo(e.target.value)} />
            <Campo etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Campo etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </Tarjeta>
        <TarjetaProgramacion />
      </div>
      {error ? <Alerta tipo="error" titulo="No se pudieron cargar los reportes">{mensajeDe(error)}</Alerta> : null}
      {isPending ? <Esqueleto lineas={4} /> : null}
      {reportes?.length === 0 ? <EstadoVacio icono={DocumentTextIcon} titulo="Aún no hay reportes" /> : null}
      {reportes && reportes.length > 0 ? (
        <Tabla>
          <Cabecera>
            <Th primera>Tipo</Th>
            <Th>Período</Th>
            <Th>Generado</Th>
            <Th ultima>Archivo</Th>
          </Cabecera>
          <Cuerpo>
            {reportes.map((r) => (
              <tr key={r.id}>
                <Td primera principal>
                  {TIPOS.find((t) => t.valor === r.tipo)?.texto ?? r.tipo}
                </Td>
                <Td>
                  {r.desde.slice(0, 10)} a {r.hasta.slice(0, 10)}
                </Td>
                <Td>
                  {formatearFechaHora(r.generadoEn)} · {r.generadoPor}
                </Td>
                <Td ultima>
                  <Boton variante="secundario" tamano="sm" onClick={() => void descargar(`/reportes/${r.id}/descargar`)}>
                    Descargar
                  </Boton>
                </Td>
              </tr>
            ))}
          </Cuerpo>
        </Tabla>
      ) : null}

      <Modal
        abierto={confirmar}
        onCerrar={() => setConfirmar(false)}
        titulo="Exportar datos anonimizados"
        descripcion="Se descarga un CSV sin nombre, documento, correo ni teléfono, con las fechas de arriba si las indicó. La exportación queda en la bitácora."
        icono={ExclamationTriangleIcon}
        tonoIcono="amarillo"
        acciones={
          <>
            <Boton
              onClick={() => {
                setConfirmar(false);
                void descargar('/privacidad/exportar', { desde: inicioDiaBogota(desde), hasta: finDiaBogota(hasta) });
              }}
            >
              Exportar
            </Boton>
            <Boton variante="secundario" onClick={() => setConfirmar(false)}>
              Cancelar
            </Boton>
          </>
        }
      />
    </div>
  );
}

function TarjetaProgramacion() {
  const { data, isPending, error } = useQuery({ queryKey: clavesKpi.programacion, queryFn: kpiApi.programacion });
  if (error) return <Alerta tipo="error">{mensajeDe(error) ?? 'No se pudo cargar la programación.'}</Alerta>;
  if (isPending || !data) return <Esqueleto lineas={4} />;
  return <FormularioProgramacion key={JSON.stringify(data)} periodicidad={data.periodicidad ?? ''} destinatarios={data.destinatarios.join(', ')} />;
}

function FormularioProgramacion(inicial: { periodicidad: string; destinatarios: string }) {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [periodicidad, setPeriodicidad] = useState(inicial.periodicidad);
  const [destinatarios, setDestinatarios] = useState(inicial.destinatarios);
  const guardar = useMutation({
    mutationFn: () => kpiApi.guardarProgramacion({ periodicidad: periodicidad || null, destinatarios: destinatarios.split(',').map((d) => d.trim()).filter(Boolean) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesKpi.programacion });
      notificar.exito('Programación guardada');
    },
    onError: (e) => notificar.error('No se pudo guardar', mensajeDe(e)),
  });
  return (
    <Tarjeta
      titulo="Reporte programado"
      descripcion="Se envía por correo a las 6:00 a. m. al cerrar cada período."
      pie={
        <Boton variante="secundario" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar
        </Boton>
      }
    >
      <div className="space-y-4">
        <Selector etiqueta="Periodicidad" marcador="Sin envío" opciones={PERIODOS} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} />
        <AreaTexto etiqueta="Destinatarios" ayuda="Correos separados por coma" rows={2} value={destinatarios} onChange={(e) => setDestinatarios(e.target.value)} />
      </div>
    </Tarjeta>
  );
}
