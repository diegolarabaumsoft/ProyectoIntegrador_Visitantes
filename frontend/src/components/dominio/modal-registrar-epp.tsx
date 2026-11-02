'use client';

/**
 * Modal reutilizable para registrar la entrega de EPP a un visitante.
 * Contrato compartido (sección 12.6): props estables para CL-01 (check-in/out).
 *
 * Adaptado de Tailwind Plus · overlays/modal-dialogs + forms/checkboxes
 * (application-ui-v4/react/overlays y forms).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Boton } from '@/components/ui/boton';
import { Casilla } from '@/components/ui/casilla';
import { Cargando } from '@/components/ui/cargando';
import { Alerta } from '@/components/ui/alerta';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import {
  type ElementoEpp,
  type EstadoEpp,
  NOMBRE_EPP,
  TODOS_ELEMENTOS_EPP,
  clavesEpp,
  obtenerEstadoEpp,
  registrarEntregaEpp,
} from '@/services/epp';
import { useState } from 'react';
import { useNotificar } from '@/components/ui/notificaciones';

interface Props {
  visitaId: string;
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: (estado: EstadoEpp) => void;
}

export function ModalRegistrarEpp({ visitaId, abierto, onCerrar, onRegistrado }: Props) {
  const queryClient = useQueryClient();
  const notificar = useNotificar();

  const { data: estadoActual, isLoading, error } = useQuery({
    queryKey: clavesEpp.estado(visitaId),
    queryFn: () => obtenerEstadoEpp(visitaId),
    enabled: abierto,
  });

  // Selección de elementos a entregar
  const [seleccionados, setSeleccionados] = useState<Set<ElementoEpp>>(new Set());

  const toggleElemento = (elemento: ElementoEpp) => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(elemento)) {
        siguiente.delete(elemento);
      } else {
        siguiente.add(elemento);
      }
      return siguiente;
    });
  };

  const mutation = useMutation({
    mutationFn: (elementos: { elemento: ElementoEpp; entregado: boolean }[]) =>
      registrarEntregaEpp(visitaId, elementos),
    onSuccess: (resultado) => {
      queryClient.setQueryData(clavesEpp.estado(visitaId), resultado);
      notificar.exito('EPP registrado', resultado.completo ? 'Equipos completos' : `Faltan: ${resultado.faltantes.map((e) => NOMBRE_EPP[e]).join(', ')}`);
      setSeleccionados(new Set());
      onRegistrado(resultado);
      onCerrar();
    },
    onError: () => {
      notificar.error('Error al registrar EPP', 'Intente de nuevo');
    },
  });

  const handleGuardar = () => {
    // Solo se envía lo nuevo: los ya entregados conservan su registro
    mutation.mutate([...seleccionados].map((elemento) => ({ elemento, entregado: true })));
  };

  // Pre-marcar los que ya están entregados cuando carga el estado
  const entregadosActuales = new Set(
    estadoActual?.entregados.filter((e) => e.entregado).map((e) => e.elemento) ?? [],
  );

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar entrega de EPP"
      descripcion="Seleccione los equipos de protección personal entregados al visitante."
      icono={ShieldCheckIcon}
      tonoIcono="indigo"
      ancho="md"
      acciones={
        <>
          <Boton
            variante="primario"
            onClick={handleGuardar}
            cargando={mutation.isPending}
            disabled={mutation.isPending || seleccionados.size === 0}
          >
            Registrar EPP
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={mutation.isPending}>
            Cancelar
          </Boton>
        </>
      }
    >
      {isLoading ? (
        <Cargando texto="Cargando estado de EPP..." />
      ) : error ? (
        <Alerta tipo="error" titulo="Error al cargar el estado del EPP" />
      ) : (
        <div className="space-y-3">
          {TODOS_ELEMENTOS_EPP.map((elemento) => {
            const esObligatorio = estadoActual?.obligatorios.includes(elemento) ?? false;
            const yaEntregado = entregadosActuales.has(elemento);
            const marcado = seleccionados.has(elemento) || yaEntregado;

            return (
              <div key={elemento} className="flex items-center justify-between">
                <Casilla
                  etiqueta={
                    <span className="flex items-center gap-2">
                      {NOMBRE_EPP[elemento]}
                      {esObligatorio && (
                        <Insignia color="rojo">Obligatorio</Insignia>
                      )}
                    </span>
                  }
                  checked={marcado}
                  onChange={() => {
                    if (!yaEntregado) toggleElemento(elemento);
                  }}
                  disabled={yaEntregado}
                />
              </div>
            );
          })}
          {mutation.isError && (
            <Alerta tipo="error" titulo="No se pudo registrar el EPP" />
          )}
        </div>
      )}
    </Modal>
  );
}
