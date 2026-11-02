'use client';

import { CalendarDaysIcon, PlusIcon } from '@heroicons/react/20/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { InsigniaEstadoVisita } from '@/components/ui/insignia';
import { useNotificar } from '@/components/ui/notificaciones';
import { PestanasPildora, type Pestana } from '@/components/ui/pestanas';
import { Cabecera, Cuerpo, FilaVacia, Tabla, Td, Th } from '@/components/ui/tabla';
import { Alerta } from '@/components/ui/alerta';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { clavesInvitaciones, invitacionesApi } from '@/services/invitaciones';
import type { EstadoVisita } from '@/types/api';

type Filtro = EstadoVisita | '';

const LIMITE = 20;

/** A1 · Mis visitas. Adaptado de Tailwind Plus · lists/tables (simple in card) + tabs in pills. */
export function MisVisitas() {
  const [filtro, setFiltro] = useState<Filtro>('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const notificar = useNotificar();
  const queryClient = useQueryClient();

  const filtros = { estado: filtro, q: busqueda || undefined, pagina, limite: LIMITE };
  const { data, isPending, error } = useQuery({
    queryKey: clavesInvitaciones.lista(filtros),
    queryFn: () => invitacionesApi.listar(filtros),
    placeholderData: (previa) => previa,
  });

  const reenviar = useMutation({
    mutationFn: (visitaId: string) => invitacionesApi.reenviarEnlace(visitaId),
    onSuccess: (fila) => {
      notificar.exito('Enlace reenviado', `${fila.visitante.nombreCompleto} recibirá un nuevo correo de pre-registro.`);
      void queryClient.invalidateQueries({ queryKey: ['invitaciones'] });
    },
    onError: (e) => notificar.error('No se pudo reenviar', e instanceof ApiError ? e.message : undefined),
  });

  const conteos = data?.porEstado ?? {};
  const pestanas: Pestana<Filtro>[] = [
    { valor: '', texto: 'Todas' },
    { valor: 'PROGRAMADA', texto: 'Programada', cantidad: conteos.PROGRAMADA },
    { valor: 'PRE_REGISTRADA', texto: 'Pre-registrada', cantidad: conteos.PRE_REGISTRADA },
    { valor: 'EN_PLANTA', texto: 'En planta', cantidad: conteos.EN_PLANTA },
    { valor: 'FINALIZADA', texto: 'Finalizada', cantidad: conteos.FINALIZADA },
    { valor: 'CANCELADA', texto: 'Cancelada', cantidad: conteos.CANCELADA },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Mis visitas"
        descripcion="Invitaciones que ha creado y el estado del pre-registro de cada visitante."
        acciones={
          <Boton href="/anfitrion/invitaciones/nueva" iconoInicio={PlusIcon}>
            Nueva invitación
          </Boton>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PestanasPildora
          pestanas={pestanas}
          valor={filtro}
          onChange={(v) => {
            setFiltro(v);
            setPagina(1);
          }}
          etiqueta="Filtrar por estado"
        />
        <Campo
          type="search"
          placeholder="Buscar por empresa o motivo"
          aria-label="Buscar por empresa o motivo"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(1);
          }}
          className="sm:w-72"
        />
      </div>

      {error ? (
        <Alerta tipo="error" titulo="No se pudieron cargar las visitas">
          {error instanceof ApiError ? error.message : 'Intente de nuevo en unos segundos.'}
        </Alerta>
      ) : isPending && !data ? (
        <Cargando texto="Cargando visitas…" />
      ) : data && data.datos.length === 0 ? (
        <EstadoVacio
          icono={CalendarDaysIcon}
          titulo={filtro || busqueda ? 'Sin resultados' : 'Aún no tiene invitaciones'}
          descripcion={filtro || busqueda ? 'Pruebe con otro filtro o búsqueda.' : 'Cree una invitación y el visitante recibirá el enlace de pre-registro.'}
          accion={
            !filtro && !busqueda ? (
              <Boton href="/anfitrion/invitaciones/nueva" iconoInicio={PlusIcon}>
                Nueva invitación
              </Boton>
            ) : null
          }
        />
      ) : data ? (
        <>
          <Tabla>
            <Cabecera>
              <Th primera>Visitante</Th>
              <Th>Empresa</Th>
              <Th>Fecha y hora</Th>
              <Th>Motivo</Th>
              <Th>Estado</Th>
              <Th ultima oculta>
                Acciones
              </Th>
            </Cabecera>
            <Cuerpo>
              {data.datos.map((fila) => (
                <tr key={fila.id}>
                  <Td primera principal>
                    {fila.visitante.nombreCompleto}
                    {fila.esGrupal ? <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">grupo</span> : null}
                  </Td>
                  <Td>{fila.visitante.empresa}</Td>
                  <Td>{formatearFechaHora(fila.fechaProgramada)}</Td>
                  <Td className="max-w-xs truncate">{fila.motivo}</Td>
                  <Td>
                    <InsigniaEstadoVisita estado={fila.estado} />
                  </Td>
                  <Td ultima>
                    <div className="flex justify-end gap-3">
                      {(fila.estado === 'PROGRAMADA' || fila.estado === 'PRE_REGISTRADA') && (
                        <button
                          type="button"
                          onClick={() => reenviar.mutate(fila.id)}
                          disabled={reenviar.isPending}
                          className="font-medium text-indigo-600 hover:text-indigo-900 disabled:opacity-50 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Reenviar enlace<span className="sr-only">, {fila.visitante.nombreCompleto}</span>
                        </button>
                      )}
                      {fila.invitacionId ? (
                        <Link
                          href={`/anfitrion/invitaciones/${fila.invitacionId}`}
                          className="font-medium text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Detalle<span className="sr-only">, {fila.visitante.nombreCompleto}</span>
                        </Link>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
              {data.datos.length === 0 ? <FilaVacia columnas={6}>Sin visitas</FilaVacia> : null}
            </Cuerpo>
          </Tabla>

          <nav aria-label="Paginación" className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <p>
              Mostrando <span className="font-medium">{(data.pagina - 1) * data.limite + 1}</span> a{' '}
              <span className="font-medium">{Math.min(data.pagina * data.limite, data.total)}</span> de{' '}
              <span className="font-medium">{data.total}</span> visitas
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
