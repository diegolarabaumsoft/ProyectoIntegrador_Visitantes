'use client';

import { PlayCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Cargando } from '@/components/ui/cargando';
import { GrupoRadio } from '@/components/ui/casilla';
import { Pasos } from '@/components/ui/pasos';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFecha } from '@/lib/fechas';
import { clavesPreRegistro, preRegistroApi, type EstadoPreRegistro, type ResultadoInduccion } from '@/services/pre-registro';
import { PASOS } from './datos';

interface Props {
  token: string;
  onAtras: () => void;
  onResultado: (r: ResultadoInduccion) => void;
  onCredencial: (estado: EstadoPreRegistro) => void;
}

const NORMAS = [
  'Use el EPP que le entreguen en recepción: casco, gafas, protección auditiva y botas en áreas de producción.',
  'Camine solo por las zonas demarcadas y nunca se acerque a maquinaria en movimiento.',
  'Las fibras y los químicos de tintorería son inflamables: prohibido fumar en toda la planta.',
  'En caso de alarma, siga a su acompañante al punto de encuentro por la ruta señalizada; no use ascensores.',
  'Al terminar, registre su salida en recepción y devuelva el EPP.',
];

/** V4 · Paso 3 Inducción de seguridad (HU-32): material, evaluación y manejo de inducción vigente. */
export function PasoInduccion({ token, onAtras, onResultado, onCredencial }: Props) {
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({ queryKey: clavesPreRegistro.induccion(token), queryFn: () => preRegistroApi.induccion(token) });

  const evaluar = useMutation({
    mutationFn: () => preRegistroApi.evaluar(token, Object.entries(respuestas).map(([preguntaId, opcion]) => ({ preguntaId, opcion }))),
    onSuccess: onResultado,
    onError: (e) => setErrorGeneral(e instanceof ApiError ? e.message : 'No fue posible enviar la evaluación'),
  });

  const finalizar = useMutation({
    mutationFn: () => preRegistroApi.finalizar(token),
    onSuccess: (r) => onCredencial(r.estado),
    onError: (e) => setErrorGeneral(e instanceof ApiError ? e.message : 'No fue posible finalizar el pre-registro'),
  });

  if (error) return <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo cargar la inducción.'}</Alerta>;
  if (isPending || !data) return <Cargando texto="Cargando inducción…" />;

  if (data.vigente) {
    return (
      <div className="space-y-6">
        <Pasos pasos={PASOS} actual={2} />
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Inducción de seguridad</h1>
        {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}
        <Alerta tipo="exito" titulo="Su inducción está vigente">
          Aprobó la inducción con {data.puntaje} % y es válida hasta el {formatearFecha(data.venceEn)}. No necesita repetirla.
        </Alerta>
        <Tarjeta titulo="Recuerde las normas de la planta">
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {NORMAS.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Tarjeta>
        <Boton bloque tamano="xl" iconoInicio={ShieldCheckIcon} cargando={finalizar.isPending} onClick={() => finalizar.mutate()}>
          Finalizar pre-registro
        </Boton>
      </div>
    );
  }

  const respondidas = data.preguntas.filter((p) => respuestas[p.id] !== undefined).length;
  const completa = respondidas === data.preguntas.length && data.preguntas.length > 0;

  return (
    <div className="space-y-6">
      <Pasos pasos={PASOS} actual={2} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Inducción de seguridad</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Revise el material y responda la evaluación. Se aprueba con {data.puntajeMinimo} % o más; la aprobación vale 12 meses.
        </p>
      </div>
      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}

      <div className="flex items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-white p-4 dark:border-white/15 dark:bg-gray-800/50">
        <PlayCircleIcon aria-hidden="true" className="size-12 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="text-sm">
          <p className="font-semibold text-gray-900 dark:text-white">Video de inducción (3 min)</p>
          <p className="text-gray-500 dark:text-gray-400">Riesgos de la planta textil, rutas de evacuación y uso del EPP.</p>
        </div>
      </div>

      <Tarjeta titulo="Normas de seguridad">
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          {NORMAS.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Tarjeta>

      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        Evaluación · {data.preguntas.length} preguntas
        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
          ({respondidas}/{data.preguntas.length} respondidas)
        </span>
      </h2>

      {data.preguntas.map((p, i) => (
        <Tarjeta key={p.id}>
          <GrupoRadio
            nombre={`pregunta-${p.id}`}
            leyenda={`${i + 1}. ${p.enunciado}`}
            opciones={p.opciones.map((o, idx) => ({ valor: String(idx), etiqueta: o }))}
            valor={respuestas[p.id] !== undefined ? String(respuestas[p.id]) : undefined}
            onChange={(v) => setRespuestas((r) => ({ ...r, [p.id]: Number(v) }))}
          />
        </Tarjeta>
      ))}

      <div className="flex flex-col gap-3">
        <Boton bloque tamano="xl" disabled={!completa} cargando={evaluar.isPending} onClick={() => evaluar.mutate()}>
          Enviar evaluación
        </Boton>
        <Boton bloque variante="secundario" onClick={onAtras}>
          Volver
        </Boton>
      </div>
    </div>
  );
}
