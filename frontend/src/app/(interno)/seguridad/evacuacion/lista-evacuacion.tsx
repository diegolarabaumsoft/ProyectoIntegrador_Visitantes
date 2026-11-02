'use client';

import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { UsersIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { ActualizadoHace } from '@/components/dominio/actualizado-hace';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Esqueleto } from '@/components/ui/cargando';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { ApiError } from '@/lib/api';
import { clavesPermanencia, permanenciaApi } from '@/services/permanencia';

/** J1 · Evacuación, para móvil. Adaptado de Tailwind Plus · lists/stacked-lists. */
export function ListaEvacuacion() {
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: clavesPermanencia.presentes(),
    queryFn: () => permanenciaApi.presentes(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Evacuación</h1>
        <ActualizadoHace fecha={data?.generadoEn} />
      </div>
      {data ? (
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          {data.total} {data.total === 1 ? 'visitante dentro de la planta' : 'visitantes dentro de la planta'}
        </p>
      ) : null}

      {/* En una emergencia, la última lista conocida sigue visible aunque falle la red */}
      {error ? <Alerta tipo="error" titulo="No se pudo actualizar la lista">{data ? 'Lo que ve puede estar desactualizado.' : error instanceof ApiError ? error.message : 'Intente de nuevo.'}</Alerta> : null}
      {isPending ? <Esqueleto lineas={5} /> : null}
      {data?.total === 0 ? <EstadoVacio icono={UsersIcon} titulo="No hay visitantes en planta" /> : null}

      {data && data.total > 0 ? (
        <ul role="list" className="divide-y divide-gray-200 rounded-lg bg-white shadow-sm dark:divide-white/10 dark:bg-gray-800/50">
          {data.presentes.map((p) => (
            <li key={p.visitaId} className="flex items-start justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">{p.visitante.nombreCompleto}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Zona: {p.zonaActual?.nombre ?? 'sin registrar'}
                  {p.zonaActual?.esSensible ? ' · zona sensible' : ''}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Anfitrión: {p.anfitrion}</p>
              </div>
              <Insignia color={p.sinPaso ? 'amarillo' : 'verde'} className="shrink-0">
                {p.sinPaso ? 'Autorizado, sin paso' : 'En planta'}
              </Insignia>
            </li>
          ))}
        </ul>
      ) : null}

      <Boton bloque tamano="xl" iconoInicio={ArrowPathIcon} cargando={isFetching} onClick={() => void refetch()}>
        Actualizar
      </Boton>
    </div>
  );
}
