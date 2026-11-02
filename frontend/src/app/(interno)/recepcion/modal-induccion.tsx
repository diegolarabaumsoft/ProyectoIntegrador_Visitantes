'use client';

import { AcademicCapIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Cargando } from '@/components/ui/cargando';
import { GrupoRadio } from '@/components/ui/casilla';
import { Modal } from '@/components/ui/modal';
import { ApiError } from '@/lib/api';
import { checkInApi, clavesCheckIn } from '@/services/check-in';

interface Props {
  visitaId: string;
  onCerrar: () => void;
  onAprobada: () => void;
}

/** Inducción en la tableta de recepción (sección 7.4). Adaptado de Tailwind Plus · overlays/modal-dialogs y forms/radio-groups. */
export function ModalInduccion({ visitaId, onCerrar, onAprobada }: Props) {
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const { data, isPending, error } = useQuery({ queryKey: clavesCheckIn.induccion(visitaId), queryFn: () => checkInApi.induccion(visitaId) });

  const evaluar = useMutation({
    mutationFn: () => checkInApi.evaluarInduccion(visitaId, Object.entries(respuestas).map(([preguntaId, opcion]) => ({ preguntaId, opcion }))),
    onSuccess: (r) => {
      if (r.aprobada) {
        onAprobada();
        onCerrar();
      } else {
        setRespuestas({});
      }
    },
  });

  const preguntas = data?.preguntas ?? [];
  const completa = preguntas.length > 0 && preguntas.every((p) => respuestas[p.id] !== undefined);

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Inducción de seguridad"
      descripcion={data ? `El visitante responde en la tableta. Se aprueba con ${data.puntajeMinimo} % o más.` : undefined}
      icono={AcademicCapIcon}
      ancho="lg"
      acciones={
        <>
          <Boton disabled={!completa} cargando={evaluar.isPending} onClick={() => evaluar.mutate()}>
            Enviar evaluación
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </>
      }
    >
      {isPending ? <Cargando texto="Cargando preguntas…" /> : null}
      {error ? <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo cargar la inducción.'}</Alerta> : null}
      {evaluar.data && !evaluar.data.aprobada ? (
        <Alerta tipo="error" titulo="No aprobó la inducción" className="mb-4">
          Obtuvo {evaluar.data.puntaje} %. Revise las normas con el visitante e intente de nuevo.
        </Alerta>
      ) : null}
      {evaluar.isError ? <Alerta tipo="error" className="mb-4">{evaluar.error instanceof ApiError ? evaluar.error.message : 'No se pudo enviar la evaluación.'}</Alerta> : null}
      <div className="space-y-6">
        {preguntas.map((p, i) => (
          <GrupoRadio
            key={p.id}
            nombre={`recepcion-${p.id}`}
            leyenda={`${i + 1}. ${p.enunciado}`}
            opciones={p.opciones.map((o, idx) => ({ valor: String(idx), etiqueta: o }))}
            valor={respuestas[p.id] !== undefined ? String(respuestas[p.id]) : undefined}
            onChange={(v) => setRespuestas((r) => ({ ...r, [p.id]: Number(v) }))}
          />
        ))}
      </div>
    </Modal>
  );
}
