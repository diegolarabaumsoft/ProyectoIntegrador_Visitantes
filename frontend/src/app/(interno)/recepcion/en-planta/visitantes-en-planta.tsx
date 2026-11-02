'use client';

import { ArrowRightStartOnRectangleIcon, MapPinIcon } from '@heroicons/react/20/solid';
import { UsersIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActualizadoHace } from '@/components/dominio/actualizado-hace';
import { ModalMovimientoZona } from '@/components/dominio/modal-movimiento-zona';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { formatearDuracion, formatearHora } from '@/lib/fechas';
import { clavesPermanencia, permanenciaApi, type Presente } from '@/services/permanencia';

/** R6 · Visitantes en planta. Adaptado de Tailwind Plus · lists/tables (simple in card). */
export function VisitantesEnPlanta() {
  const [q, setQ] = useState('');
  const [visitaMovimiento, setVisitaMovimiento] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const notificar = useNotificar();

  const { data, isPending, error } = useQuery({
    queryKey: clavesPermanencia.presentes(),
    queryFn: () => permanenciaApi.presentes(),
    refetchInterval: 10_000,
  });

  const texto = q.trim().toLocaleLowerCase('es');
  const filas = data?.presentes.filter((p) => !texto || p.visitante.empresa.toLocaleLowerCase('es').includes(texto) || p.visitante.nombreCompleto.toLocaleLowerCase('es').includes(texto));

  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clavesPermanencia.todas });

  const salidaZona = useMutation({
    mutationFn: (p: Presente) => permanenciaApi.registrarSalidaZona(p.visitaId, p.zonaActual!.movimientoId),
    onSuccess: refrescar,
    onError: (e) => notificar.error('No se pudo registrar la salida de la zona', e instanceof ApiError ? e.message : undefined),
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={`Visitantes en planta${data ? ` · ${data.total}` : ''}`} acciones={<ActualizadoHace fecha={data?.generadoEn} />} />
      <Campo aria-label="Buscar por empresa o nombre" placeholder="Buscar por empresa o nombre" value={q} onChange={(e) => setQ(e.target.value)} />

      {/* Con datos previos, el fallo de una actualización no debe ocultar quién está dentro */}
      {error ? <Alerta tipo="error" titulo="No se pudo actualizar la lista">{data ? 'Lo que ve puede estar desactualizado.' : error instanceof ApiError ? error.message : 'Intente de nuevo.'}</Alerta> : null}
      {isPending ? <Esqueleto lineas={5} /> : null}
      {filas?.length === 0 ? <EstadoVacio icono={UsersIcon} titulo={texto ? 'Sin resultados' : 'No hay visitantes en planta'} /> : null}
      {filas && filas.length > 0 ? (
        <Tabla>
          <Cabecera>
            <Th primera>Visitante</Th>
            <Th>Zona</Th>
            <Th>Ingreso</Th>
            <Th>Tiempo restante</Th>
            <Th>Estado</Th>
            <Th ultima>Acciones</Th>
          </Cabecera>
          <Cuerpo>
            {filas.map((p) => (
              <tr key={p.visitaId}>
                <Td primera principal>
                  {p.visitante.nombreCompleto}
                  <span className="block font-normal text-gray-500 dark:text-gray-400">
                    {p.visitante.empresa} · {p.anfitrion}
                  </span>
                </Td>
                <Td>
                  {p.zonaActual?.nombre ?? '—'}
                  {p.zonaActual?.esSensible ? <span className="block text-xs text-yellow-700 dark:text-yellow-500">Zona sensible</span> : null}
                  {p.zonaActual ? (
                    <Boton variante="enlace" className="block" disabled={salidaZona.isPending} onClick={() => salidaZona.mutate(p)}>
                      Salir de zona
                    </Boton>
                  ) : null}
                </Td>
                <Td>{formatearHora(p.horaIngreso)}</Td>
                <Td className={p.excedido ? 'font-medium text-red-600 dark:text-red-400' : undefined}>{formatearDuracion(p.minutosRestantes)}</Td>
                <Td>{p.excedido ? <Insignia color="rojo">Permanencia excedida</Insignia> : p.sinPaso ? <Insignia color="amarillo">Autorizado, sin paso</Insignia> : <Insignia color="verde">En planta</Insignia>}</Td>
                <Td ultima>
                  <div className="flex flex-col items-end gap-2">
                    <Boton variante="secundario" tamano="sm" iconoInicio={MapPinIcon} onClick={() => setVisitaMovimiento(p.visitaId)}>
                      Zona
                    </Boton>
                    <Boton variante="suave" tamano="sm" iconoInicio={ArrowRightStartOnRectangleIcon} href={`/recepcion/check-out?visitaId=${p.visitaId}`}>
                      Check-out
                    </Boton>
                  </div>
                </Td>
              </tr>
            ))}
          </Cuerpo>
        </Tabla>
      ) : null}

      <ModalMovimientoZona visitaId={visitaMovimiento ?? ''} abierto={visitaMovimiento !== null} onCerrar={() => setVisitaMovimiento(null)} onRegistrado={refrescar} />
    </div>
  );
}
