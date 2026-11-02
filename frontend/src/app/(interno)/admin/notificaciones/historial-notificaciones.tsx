'use client';

import { InboxIcon } from '@heroicons/react/24/outline';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Paginador } from '@/components/dominio/paginador';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Selector } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { clavesNotificaciones, notificacionesApi } from '@/services/notificaciones';

/** Historial de notificaciones. Adaptado de Tailwind Plus · lists/tables (simple in card). */
export function HistorialNotificaciones() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const filtros = { estado: estado || undefined, pagina };
  const { data, isPending, error } = useQuery({ queryKey: clavesNotificaciones.lista(filtros), queryFn: () => notificacionesApi.listar(filtros), placeholderData: keepPreviousData });
  const reintentar = useMutation({
    mutationFn: notificacionesApi.reintentar,
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: clavesNotificaciones.todas });
      if (r.estado === 'ENVIADA') notificar.exito('Notificación enviada');
      else notificar.error('El reenvío volvió a fallar', r.error ?? undefined);
    },
    onError: (e) => notificar.error('No se pudo reintentar', e instanceof ApiError ? e.message : undefined),
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Notificaciones" />
      <Selector
        className="max-w-xs"
        etiqueta="Estado"
        marcador="Todos"
        opciones={[{ valor: 'ENVIADA', texto: 'Enviadas' }, { valor: 'FALLIDA', texto: 'Fallidas' }, { valor: 'PENDIENTE', texto: 'Pendientes' }]}
        value={estado}
        onChange={(e) => { setEstado(e.target.value); setPagina(1); }}
      />
      {error ? <Alerta tipo="error" titulo="No se pudo cargar el historial">{error instanceof ApiError ? error.message : undefined}</Alerta> : null}
      {isPending ? <Esqueleto lineas={6} /> : null}
      {data?.datos.length === 0 ? <EstadoVacio icono={InboxIcon} titulo="Sin notificaciones" /> : null}
      {data && data.datos.length > 0 ? (
        <>
          <Tabla>
            <Cabecera>
              <Th primera>Fecha</Th>
              <Th>Destinatario</Th>
              <Th>Asunto</Th>
              <Th>Estado</Th>
              <Th ultima>Acción</Th>
            </Cabecera>
            <Cuerpo>
              {data.datos.map((n) => (
                <tr key={n.id}>
                  <Td primera>{formatearFechaHora(n.createdAt)}</Td>
                  <Td>{n.destinatario}</Td>
                  <Td className="whitespace-normal">{n.asunto}</Td>
                  <Td>
                    {n.estado === 'ENVIADA' ? <Insignia color="verde">Enviada</Insignia> : n.estado === 'FALLIDA' ? <Insignia color="rojo">Fallida</Insignia> : <Insignia color="gris">Pendiente</Insignia>}
                  </Td>
                  <Td ultima>
                    {n.estado === 'FALLIDA' ? (
                      <Boton variante="secundario" tamano="sm" disabled={reintentar.isPending} onClick={() => reintentar.mutate(n.id)}>
                        Reintentar
                      </Boton>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Cuerpo>
          </Tabla>
          <Paginador pagina={data.pagina} totalPaginas={data.totalPaginas} total={data.total} unidad="notificaciones" onCambiar={setPagina} />
        </>
      ) : null}
    </div>
  );
}
