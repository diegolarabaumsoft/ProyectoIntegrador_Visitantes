'use client';

import { UsersIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { useNotificar } from '@/components/ui/notificaciones';
import { Boton } from '@/components/ui/boton';
import { Cargando, Esqueleto } from '@/components/ui/cargando';
import { Casilla } from '@/components/ui/casilla';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { Tarjeta, ListaDescripcion } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearDuracion, formatearHora } from '@/lib/fechas';
import { checkOutApi, clavesCheckOut, type FichaCheckOut, type ResultadoCheckOut } from '@/services/check-out';
import { clavesPermanencia, permanenciaApi } from '@/services/permanencia';
import { NOMBRE_EPP, type ElementoEpp } from '@/types/api';
import { LectorQr } from '../lector-qr';

const mensajeDe = (e: unknown, alterno: string) => (e instanceof ApiError ? e.message : alterno);

/** R7 y R10 · Check-out. Adaptado de Tailwind Plus · layout/cards, forms/checkboxes y lists/stacked-lists. */
export function ConsolaCheckOut({ visitaInicial }: { visitaInicial?: string }) {
  const router = useRouter();
  const [ficha, setFicha] = useState<FichaCheckOut | null>(null);
  const [resultado, setResultado] = useState<ResultadoCheckOut | null>(null);
  const [rechazo, setRechazo] = useState<string | null>(null);

  const abrir = useMutation({
    mutationFn: checkOutApi.escanear,
    onSuccess: (r) => {
      if (r.resultado === 'VALIDA') setFicha(r.ficha);
      else setRechazo(r.mensaje);
    },
    onError: (e) => setRechazo(mensajeDe(e, 'No fue posible abrir la visita')),
  });
  const abrirVisita = abrir.mutate;

  useEffect(() => {
    if (visitaInicial) abrirVisita({ visitaId: visitaInicial });
  }, [visitaInicial, abrirVisita]);

  const reiniciar = () => {
    router.replace('/recepcion/check-out');
    setFicha(null);
    setResultado(null);
    setRechazo(null);
  };

  if (resultado) return <VisitaCerrada resultado={resultado} onSiguiente={reiniciar} />;
  if (ficha) return <ConfirmarDevolucion key={ficha.visita.id} ficha={ficha} onCancelar={reiniciar} onCerrada={setResultado} />;
  if (abrir.isPending && visitaInicial) return <Cargando texto="Abriendo la visita…" />;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Check-out" descripcion="Escanee el QR del visitante o selecciónelo de la lista." />
      {rechazo ? (
        <Alerta tipo="error" titulo="No se pudo abrir la visita">
          {rechazo}
        </Alerta>
      ) : null}
      <LectorQr
        onLectura={(codigo) => {
          setRechazo(null);
          abrir.mutate({ codigo });
        }}
      />
      <ListaSeleccion
        onSeleccionar={(visitaId) => {
          setRechazo(null);
          abrir.mutate({ visitaId });
        }}
      />
      <SalidasRecientes />
    </div>
  );
}

function ListaSeleccion({ onSeleccionar }: { onSeleccionar: (visitaId: string) => void }) {
  const { data, isPending, error } = useQuery({
    queryKey: clavesPermanencia.presentes(),
    queryFn: () => permanenciaApi.presentes(),
    refetchInterval: 10_000,
  });
  return (
    <Tarjeta titulo="Visitantes en planta">
      {isPending ? <Esqueleto lineas={3} /> : null}
      {error ? <Alerta tipo="error">{mensajeDe(error, 'No se pudo cargar la lista.')}</Alerta> : null}
      {data?.total === 0 ? <EstadoVacio className="py-6" icono={UsersIcon} titulo="No hay visitantes en planta" /> : null}
      {data && data.total > 0 ? (
        <ul role="list" className="divide-y divide-gray-100 dark:divide-white/5">
          {data.presentes.map((p) => (
            <li key={p.visitaId} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.visitante.nombreCompleto}</p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {p.visitante.empresa} · {p.anfitrion} · ingreso {formatearHora(p.horaIngreso)}
                </p>
              </div>
              <Boton variante="secundario" tamano="md" onClick={() => onSeleccionar(p.visitaId)}>
                Seleccionar
              </Boton>
            </li>
          ))}
        </ul>
      ) : null}
    </Tarjeta>
  );
}

function ConfirmarDevolucion({ ficha, onCancelar, onCerrada }: { ficha: FichaCheckOut; onCancelar: () => void; onCerrada: (r: ResultadoCheckOut) => void }) {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [credencial, setCredencial] = useState(false);
  const [devueltos, setDevueltos] = useState<Set<ElementoEpp>>(new Set());

  const confirmar = useMutation({
    mutationFn: () => checkOutApi.confirmar(ficha.visita.id, { credencialDevuelta: credencial, eppDevuelto: [...devueltos] }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: clavesPermanencia.todas });
      onCerrada(r);
    },
  });

  const devolucion = useMutation({
    mutationFn: () => checkOutApi.devolucion(ficha.visita.id, { credencialDevuelta: credencial, eppDevuelto: [...devueltos] }),
    onSuccess: () => {
      notificar.exito('Devolución registrada', 'El visitante puede salir con su huella por el torniquete.');
      void queryClient.invalidateQueries({ queryKey: clavesPermanencia.todas });
      onCancelar();
    },
  });

  const alternar = (elemento: ElementoEpp) =>
    setDevueltos((actual) => {
      const siguiente = new Set(actual);
      if (!siguiente.delete(elemento)) siguiente.add(elemento);
      return siguiente;
    });

  const faltantes = (credencial || !ficha.tieneCredencial ? 0 : 1) + ficha.epp.filter((e) => !devueltos.has(e)).length;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={ficha.visitante.nombreCompleto} descripcion={ficha.visitante.empresa} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Tarjeta titulo="Visita" sinRelleno>
            <ListaDescripcion
              items={[
                { termino: 'Ingreso', valor: formatearHora(ficha.visita.horaIngreso) },
                { termino: 'Anfitrión', valor: ficha.anfitrion },
                { termino: 'Duración autorizada', valor: formatearDuracion(ficha.visita.tiempoAutorizadoMin) },
              ]}
            />
          </Tarjeta>
          <Tarjeta titulo="EPP entregado">
            {ficha.epp.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin EPP pendiente de devolución.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                {ficha.epp.map((e) => (
                  <li key={e}>{NOMBRE_EPP[e]}</li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
        <Tarjeta
          titulo="Confirmar devolución"
          descripcion="Si un elemento no se devuelve, se registra una incidencia."
          pie={
            <div className="flex justify-end gap-3">
              <Boton variante="secundario" onClick={onCancelar}>
                Cancelar
              </Boton>
              {ficha.usaTerminales ? (
                <Boton variante="secundario" cargando={devolucion.isPending} onClick={() => devolucion.mutate()}>
                  Saldrá por el torniquete
                </Boton>
              ) : null}
              <Boton variante={faltantes > 0 ? 'peligro' : 'primario'} cargando={confirmar.isPending} onClick={() => confirmar.mutate()}>
                {faltantes > 0 ? `Registrar check-out con ${faltantes} ${faltantes === 1 ? 'incidencia' : 'incidencias'}` : 'Registrar check-out'}
              </Boton>
            </div>
          }
        >
          <div className="space-y-4">
            {ficha.tieneCredencial ? <Casilla etiqueta="Credencial física" checked={credencial} onChange={(e) => setCredencial(e.target.checked)} /> : null}
            {ficha.epp.map((e) => (
              <Casilla key={e} etiqueta={NOMBRE_EPP[e]} checked={devueltos.has(e)} onChange={() => alternar(e)} />
            ))}
          </div>
          {confirmar.isError ? (
            <Alerta tipo="error" className="mt-4">
              {mensajeDe(confirmar.error, 'No fue posible registrar la salida')}
            </Alerta>
          ) : null}
        </Tarjeta>
      </div>
    </div>
  );
}

/** Tabla 16: la salida por terminal no pasa por esta consola, así que recepción la ve aquí. */
function SalidasRecientes() {
  const { data, error } = useQuery({ queryKey: clavesCheckOut.salidas, queryFn: checkOutApi.salidasRecientes, refetchInterval: 10_000 });
  if (error) return <Alerta tipo="error">{mensajeDe(error, 'No se pudieron cargar las salidas.')}</Alerta>;
  if (!data || data.length === 0) return null;
  return (
    <Tarjeta titulo="Salidas de hoy con huella">
      <ul role="list" className="divide-y divide-gray-100 dark:divide-white/5">
        {data.map((s) => (
          <li key={s.visitaId} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.visitante.nombreCompleto}</p>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {s.terminal ?? 'Consola de recepción'} · {formatearHora(s.horaSalida)}
              </p>
            </div>
            {s.revocacionesPendientes > 0 ? <Insignia color="amarillo">Revocación pendiente: {s.revocacionesPendientes}</Insignia> : <Insignia color="verde">Plantilla revocada</Insignia>}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function VisitaCerrada({ resultado, onSiguiente }: { resultado: ResultadoCheckOut; onSiguiente: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <Insignia color="indigo">Visita cerrada</Insignia>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{resultado.visitante.nombreCompleto}</h1>
      <Tarjeta sinRelleno className="text-left">
        <ListaDescripcion
          items={[
            { termino: 'Hora de salida', valor: formatearHora(resultado.horaSalida) },
            { termino: 'Incidencias', valor: resultado.incidencias.length > 0 ? resultado.incidencias.join(', ') : 'Ninguna' },
            { termino: 'Acceso', valor: resultado.acs.detalle },
          ]}
        />
      </Tarjeta>
      {resultado.incidencias.length > 0 ? <Alerta tipo="advertencia">Se notificó a Seguridad de los elementos sin devolver.</Alerta> : null}
      {resultado.acs.contingencia ? <Alerta tipo="advertencia">La revocación no se completó: {resultado.acs.detalle}</Alerta> : null}
      <Boton tamano="xl" bloque onClick={onSiguiente}>
        Siguiente
      </Boton>
    </div>
  );
}
