'use client';

/**
 * R9 · Movimiento entre zonas. Contrato de la sección 12.6.
 * Adaptado de Tailwind Plus · overlays/modal-dialogs + forms/select-menus.
 */

import { MapPinIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Selector } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { Modal } from '@/components/ui/modal';
import { ApiError } from '@/lib/api';
import { checkInApi, clavesCheckIn } from '@/services/check-in';
import { permanenciaApi } from '@/services/permanencia';

interface Props {
  visitaId: string;
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: () => void;
}

export function ModalMovimientoZona({ visitaId, abierto, onCerrar, onRegistrado }: Props) {
  const [zonaId, setZonaId] = useState('');
  const [acompananteId, setAcompananteId] = useState('');
  const { data: catalogos, isPending, error } = useQuery({ queryKey: clavesCheckIn.catalogos, queryFn: checkInApi.catalogos, enabled: abierto });

  const zona = catalogos?.zonas.find((z) => z.id === zonaId);
  const registrar = useMutation({
    mutationFn: async () => {
      if (acompananteId) await permanenciaApi.asignarAcompanante(visitaId, acompananteId);
      return permanenciaApi.registrarMovimiento(visitaId, zonaId);
    },
    onSuccess: () => {
      setZonaId('');
      setAcompananteId('');
      onRegistrado();
      onCerrar();
    },
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar entrada a una zona"
      descripcion="Si el visitante estaba en otra zona, se registra también su salida."
      icono={MapPinIcon}
      acciones={
        <>
          <Boton disabled={!zonaId} cargando={registrar.isPending} onClick={() => registrar.mutate()}>
            Registrar entrada
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </>
      }
    >
      {isPending && abierto ? <Cargando texto="Cargando zonas…" /> : null}
      {error ? <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudieron cargar las zonas.'}</Alerta> : null}
      {catalogos ? (
        <div className="space-y-4">
          <Selector
            etiqueta="Zona"
            marcador="Seleccione…"
            value={zonaId}
            onChange={(e) => setZonaId(e.target.value)}
            opciones={catalogos.zonas.map((z) => ({ valor: z.id, texto: z.nombre }))}
          />
          {zona?.esSensible ? <Alerta tipo="advertencia">Esta es una zona sensible.</Alerta> : null}
          {zona?.requiereAcompanante ? (
            <Selector
              etiqueta="Acompañante"
              ayuda="Esta zona exige acompañante. Déjelo vacío si la visita ya tiene uno asignado."
              marcador="Mantener el asignado"
              value={acompananteId}
              onChange={(e) => setAcompananteId(e.target.value)}
              opciones={catalogos.acompanantes.map((a) => ({ valor: a.id, texto: a.area ? `${a.nombre} · ${a.area}` : a.nombre }))}
            />
          ) : null}
          {registrar.isError ? <Alerta tipo="error">{registrar.error instanceof ApiError ? registrar.error.message : 'No se pudo registrar el movimiento.'}</Alerta> : null}
        </div>
      ) : null}
    </Modal>
  );
}
