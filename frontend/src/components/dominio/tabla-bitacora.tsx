'use client';

/** DP3 · Bitácora de solo lectura. Adaptado de Tailwind Plus · lists/tables (simple in card) y forms/input-groups. */

import { ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { ArchiveBoxIcon } from '@heroicons/react/24/outline';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { useNotificar } from '@/components/ui/notificaciones';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { abrirDescarga, finDiaBogota, inicioDiaBogota } from '@/services/descargas';
import { bitacoraApi, clavesBitacora, TIPOS_EVENTO } from '@/services/bitacora';

const nombreTipo = (tipo: string) => tipo.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const OPCIONES = TIPOS_EVENTO.map((valor) => ({ valor, texto: nombreTipo(valor) })).sort((a, b) => a.texto.localeCompare(b.texto, 'es'));

export function TablaBitacora() {
  const [tipoEvento, setTipoEvento] = useState('');
  const [actor, setActor] = useState('');
  const [actorAplicado, setActorAplicado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);

  // Espera a que termine de escribir: cada consulta recorre una tabla que solo crece
  useEffect(() => {
    const espera = window.setTimeout(() => {
      setActorAplicado(actor.trim());
      setPagina(1);
    }, 400);
    return () => window.clearTimeout(espera);
  }, [actor]);

  const filtros = { tipoEvento, actor: actorAplicado, desde: inicioDiaBogota(desde), hasta: finDiaBogota(hasta) };
  const { data, isPending, error } = useQuery({
    queryKey: clavesBitacora.lista({ ...filtros, pagina }),
    queryFn: () => bitacoraApi.consultar({ ...filtros, pagina }),
    placeholderData: keepPreviousData,
  });

  const notificar = useNotificar();
  const exportar = () =>
    abrirDescarga('/bitacora/exportar', { formato: 'csv', tipoEvento, actor: actorAplicado, desde: filtros.desde, hasta: filtros.hasta }).catch((e: unknown) =>
      notificar.error('No se pudo exportar', e instanceof ApiError ? e.message : undefined),
    );

  const cambiar = (aplicar: (valor: string) => void) => (valor: string) => {
    aplicar(valor);
    setPagina(1);
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Bitácora de accesos"
        descripcion="Registro inmutable de los eventos del sistema."
        acciones={
          <Boton variante="secundario" iconoInicio={ArrowDownTrayIcon} onClick={() => void exportar()}>
            Exportar CSV
          </Boton>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Selector etiqueta="Tipo de evento" marcador="Todos" opciones={OPCIONES} value={tipoEvento} onChange={(e) => cambiar(setTipoEvento)(e.target.value)} />
        <Campo etiqueta="Actor" value={actor} onChange={(e) => setActor(e.target.value)} />
        <Campo etiqueta="Desde" type="date" value={desde} onChange={(e) => cambiar(setDesde)(e.target.value)} />
        <Campo etiqueta="Hasta" type="date" value={hasta} onChange={(e) => cambiar(setHasta)(e.target.value)} />
      </div>

      {error ? <Alerta tipo="error" titulo="No se pudo cargar la bitácora">{error instanceof ApiError ? error.message : undefined}</Alerta> : null}
      {isPending ? <Esqueleto lineas={6} /> : null}
      {data?.datos.length === 0 ? <EstadoVacio icono={ArchiveBoxIcon} titulo="Sin eventos" descripcion="Ningún evento coincide con los filtros." /> : null}
      {data && data.datos.length > 0 ? (
        <>
          <Tabla>
            <Cabecera>
              <Th primera>Fecha y hora</Th>
              <Th>Evento</Th>
              <Th>Actor</Th>
              <Th>Resultado</Th>
              <Th ultima>IP</Th>
            </Cabecera>
            <Cuerpo>
              {data.datos.map((e) => (
                <tr key={e.id}>
                  <Td primera>{formatearFechaHora(e.fechaHora)}</Td>
                  <Td principal>{nombreTipo(e.tipoEvento)}</Td>
                  <Td>{e.actor}</Td>
                  <Td className="whitespace-normal">{e.resultado}</Td>
                  <Td ultima>{e.ip ?? '—'}</Td>
                </tr>
              ))}
            </Cuerpo>
          </Tabla>
          <nav className="flex items-center justify-between">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Página {data.pagina} de {data.totalPaginas} · {data.total} eventos
            </p>
            <div className="flex gap-3">
              <Boton variante="secundario" tamano="md" disabled={data.pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </Boton>
              <Boton variante="secundario" tamano="md" disabled={data.pagina >= data.totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                Siguiente
              </Boton>
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
