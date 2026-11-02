'use client';

import { PlusIcon } from '@heroicons/react/20/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { AreaTexto, Campo } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { Casilla, GrupoRadio } from '@/components/ui/casilla';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { clavesConfiguracion, configuracionApi, type Parametro, type Pregunta } from '@/services/configuracion';
import { NOMBRE_EPP, type ElementoEpp } from '@/types/api';

const mensajeDe = (e: unknown) => (e instanceof ApiError ? e.message : undefined);
const EPP = Object.keys(NOMBRE_EPP) as ElementoEpp[];

/** AD7 · Configuración. Adaptado de Tailwind Plus · forms/form-layouts y lists/stacked-lists. */
export function Configuracion() {
  const { data, isPending, error } = useQuery({ queryKey: clavesConfiguracion.parametros, queryFn: configuracionApi.parametros });
  const { data: acs } = useQuery({ queryKey: clavesConfiguracion.acs, queryFn: configuracionApi.estadoAcs, retry: false });
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Configuración" />
      <Tarjeta titulo="Parámetros">
        {error ? <Alerta tipo="error">{mensajeDe(error) ?? 'No se pudieron cargar los parámetros.'}</Alerta> : null}
        {isPending ? <Esqueleto lineas={6} /> : null}
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {data?.filter((p) => !p.clave.startsWith('reportes_')).map((p) => (
            <FilaParametro key={`${p.clave}:${JSON.stringify(p.valor)}`} parametro={p} />
          ))}
        </div>
      </Tarjeta>
      {acs ? (
        <Tarjeta titulo="Control de acceso físico" sinRelleno>
          <ListaDescripcion
            items={[
              { termino: 'Modo', valor: acs.modo === 'http' ? `HTTP · ${acs.destino ?? ''}` : `Simulado · ${acs.comportamiento ?? ''}` },
              { termino: 'Tiempo límite', valor: `${acs.timeoutMs} ms` },
              { termino: 'Autorizaciones en cola', valor: acs.pendientes },
            ]}
          />
        </Tarjeta>
      ) : null}
      <TarjetaPreguntas />
    </div>
  );
}

function FilaParametro({ parametro }: { parametro: Parametro }) {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const esLista = Array.isArray(parametro.valor);
  const esNumero = typeof parametro.valor === 'number';
  const [texto, setTexto] = useState(esLista ? '' : String(parametro.valor ?? ''));
  const [lista, setLista] = useState<string[]>(esLista ? (parametro.valor as string[]) : []);
  const guardar = useMutation({
    mutationFn: () => configuracionApi.guardar(parametro.clave, esLista ? lista : esNumero ? Number(texto) : texto.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesConfiguracion.parametros });
      notificar.exito('Parámetro guardado');
    },
    onError: (e) => notificar.error('No se pudo guardar', mensajeDe(e)),
  });
  return (
    <div className="flex flex-wrap items-end gap-4 py-4">
      <div className="min-w-64 flex-1">
        {esLista ? (
          <>
            <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">{parametro.descripcion ?? parametro.clave}</p>
            <div className="grid grid-cols-2 gap-2">
              {EPP.map((e) => (
                <Casilla key={e} etiqueta={NOMBRE_EPP[e]} checked={lista.includes(e)} onChange={(ev) => setLista((l) => (ev.target.checked ? [...l, e] : l.filter((x) => x !== e)))} />
              ))}
            </div>
          </>
        ) : (
          <Campo etiqueta={parametro.descripcion ?? parametro.clave} type={esNumero ? 'number' : 'text'} min={esNumero ? 1 : undefined} value={texto} onChange={(e) => setTexto(e.target.value)} />
        )}
      </div>
      <Boton variante="secundario" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
        Guardar
      </Boton>
    </div>
  );
}

function TarjetaPreguntas() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [editando, setEditando] = useState<Pregunta | 'nueva' | null>(null);
  const { data, isPending, error } = useQuery({ queryKey: clavesConfiguracion.preguntas, queryFn: configuracionApi.preguntas });
  const desactivar = useMutation({
    mutationFn: configuracionApi.desactivarPregunta,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clavesConfiguracion.preguntas }),
    onError: (e) => notificar.error('No se pudo desactivar', mensajeDe(e)),
  });
  return (
    <Tarjeta
      titulo="Preguntas de inducción"
      acciones={
        <Boton variante="secundario" iconoInicio={PlusIcon} onClick={() => setEditando('nueva')}>
          Nueva pregunta
        </Boton>
      }
    >
      {error ? <Alerta tipo="error">{mensajeDe(error) ?? 'No se pudieron cargar las preguntas.'}</Alerta> : null}
      {isPending ? <Esqueleto lineas={4} /> : null}
      <ul role="list" className="divide-y divide-gray-100 dark:divide-white/5">
        {data?.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-gray-900 dark:text-white">
                {p.orden}. {p.enunciado}
              </p>
              <p className="text-gray-500 dark:text-gray-400">Correcta: {p.opciones[p.respuestaCorrecta]}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {p.activa ? null : <Insignia color="gris">Inactiva</Insignia>}
              <Boton variante="secundario" tamano="sm" onClick={() => setEditando(p)}>
                Editar
              </Boton>
              {p.activa ? (
                <Boton variante="suave" tamano="sm" onClick={() => desactivar.mutate(p.id)}>
                  Desactivar
                </Boton>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {editando ? <ModalPregunta key={editando === 'nueva' ? 'nueva' : editando.id} pregunta={editando === 'nueva' ? null : editando} siguienteOrden={(data?.length ?? 0) + 1} onCerrar={() => setEditando(null)} /> : null}
    </Tarjeta>
  );
}

function ModalPregunta({ pregunta, siguienteOrden, onCerrar }: { pregunta: Pregunta | null; siguienteOrden: number; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [enunciado, setEnunciado] = useState(pregunta?.enunciado ?? '');
  const [opciones, setOpciones] = useState(pregunta?.opciones.join('\n') ?? '');
  const [correcta, setCorrecta] = useState(pregunta?.respuestaCorrecta ?? 0);
  const lista = opciones.split('\n').map((o) => o.trim()).filter(Boolean);
  const guardar = useMutation({
    mutationFn: () => {
      const datos = { enunciado: enunciado.trim(), opciones: lista, respuestaCorrecta: correcta, orden: pregunta?.orden ?? siguienteOrden };
      return pregunta ? configuracionApi.actualizarPregunta(pregunta.id, datos) : configuracionApi.crearPregunta(datos);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesConfiguracion.preguntas });
      onCerrar();
    },
  });
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={pregunta ? 'Editar pregunta' : 'Nueva pregunta'}
      ancho="lg"
      acciones={
        <>
          <Boton disabled={enunciado.trim().length < 5 || lista.length < 2 || lista.length > 6 || correcta >= lista.length} cargando={guardar.isPending} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <AreaTexto etiqueta="Enunciado" rows={2} value={enunciado} onChange={(e) => setEnunciado(e.target.value)} />
        <AreaTexto etiqueta="Opciones" ayuda="Una por línea, entre 2 y 6" rows={5} value={opciones} onChange={(e) => setOpciones(e.target.value)} />
        <GrupoRadio nombre="correcta" leyenda="Opción correcta" opciones={lista.map((o, i) => ({ valor: String(i), etiqueta: o }))} valor={String(correcta)} onChange={(v) => setCorrecta(Number(v))} />
        {guardar.isError ? <Alerta tipo="error">{mensajeDe(guardar.error) ?? 'No se pudo guardar la pregunta'}</Alerta> : null}
      </div>
    </Modal>
  );
}
