'use client';

import { ArchiveBoxIcon } from '@heroicons/react/24/outline';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Paginador } from '@/components/dominio/paginador';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { InsigniaEstadoVisita } from '@/components/ui/insignia';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { finDiaBogota, inicioDiaBogota } from '@/services/descargas';
import { clavesVisitas, visitasApi } from '@/services/visitas';
import { NOMBRE_ESTADO_VISITA, type EstadoVisita } from '@/types/api';

const ESTADOS = (Object.keys(NOMBRE_ESTADO_VISITA) as EstadoVisita[]).map((valor) => ({ valor, texto: NOMBRE_ESTADO_VISITA[valor] }));

/** AD8 · Histórico de visitas. Adaptado de Tailwind Plus · lists/tables (simple in card). */
export function HistoricoVisitas() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [documento, setDocumento] = useState('');
  const [texto, setTexto] = useState({ empresa: '', documento: '' });
  const [pagina, setPagina] = useState(1);

  // Empresa y documento se aplican cuando se termina de escribir
  useEffect(() => {
    const espera = window.setTimeout(() => {
      setTexto({ empresa: empresa.trim(), documento: documento.trim() });
      setPagina(1);
    }, 400);
    return () => window.clearTimeout(espera);
  }, [empresa, documento]);

  const filtros = { desde: inicioDiaBogota(desde), hasta: finDiaBogota(hasta), estado: estado || undefined, empresa: texto.empresa || undefined, documento: texto.documento || undefined, pagina };
  const { data, isPending, error } = useQuery({ queryKey: clavesVisitas.lista(filtros), queryFn: () => visitasApi.listar(filtros), placeholderData: keepPreviousData });

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Histórico de visitas" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Campo etiqueta="Desde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} />
        <Campo etiqueta="Hasta" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} />
        <Campo etiqueta="Empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        <Campo etiqueta="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        <Selector etiqueta="Estado" marcador="Todos" opciones={ESTADOS} value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} />
      </div>
      {error ? <Alerta tipo="error" titulo="No se pudo cargar el histórico">{error instanceof ApiError ? error.message : undefined}</Alerta> : null}
      {isPending ? <Esqueleto lineas={6} /> : null}
      {data?.datos.length === 0 ? <EstadoVacio icono={ArchiveBoxIcon} titulo="Sin visitas" descripcion="Ninguna visita coincide con los filtros." /> : null}
      {data && data.datos.length > 0 ? (
        <>
          <Tabla>
            <Cabecera>
              <Th primera>Visitante</Th>
              <Th>Anfitrión</Th>
              <Th>Fecha</Th>
              <Th>Estado</Th>
              <Th ultima>Detalle</Th>
            </Cabecera>
            <Cuerpo>
              {data.datos.map((v) => (
                <tr key={v.id}>
                  <Td primera principal>
                    {v.visitante.nombreCompleto}
                    <span className="block font-normal text-gray-500 dark:text-gray-400">{v.visitante.empresa}</span>
                  </Td>
                  <Td>{v.anfitrion}</Td>
                  <Td>{formatearFechaHora(v.fechaProgramada)}</Td>
                  <Td>
                    <InsigniaEstadoVisita estado={v.estado} />
                  </Td>
                  <Td ultima>
                    <Boton variante="secundario" tamano="sm" href={`/admin/historico/${v.id}`}>
                      Ver
                    </Boton>
                  </Td>
                </tr>
              ))}
            </Cuerpo>
          </Tabla>
          <Paginador pagina={data.pagina} totalPaginas={data.totalPaginas} total={data.total} unidad="visitas" onCambiar={setPagina} />
        </>
      ) : null}
    </div>
  );
}
