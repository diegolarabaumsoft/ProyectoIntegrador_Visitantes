'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { useNotificar } from '@/components/ui/notificaciones';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { clavesPrivacidad, privacidadApi, type Retencion } from '@/services/privacidad';

/** DP2 · Política de retención. Adaptado de Tailwind Plus · forms/form-layouts. */
export function PoliticaRetencion() {
  const { data, isPending, error } = useQuery({ queryKey: clavesPrivacidad.retencion, queryFn: privacidadApi.retencion });
  return (
    <div className="max-w-2xl space-y-6">
      <EncabezadoPagina titulo="Política de retención" descripcion="La anonimización por retención se ejecuta cada día a las 2:00 a. m." />
      {error ? <Alerta tipo="error" titulo="No se pudo cargar la política">{error instanceof ApiError ? error.message : undefined}</Alerta> : null}
      {isPending ? <Cargando /> : null}
      {data ? <Formulario key={`${data.retencionDias}:${data.politicaVersion}`} datos={data} /> : null}
    </div>
  );
}

function Formulario({ datos }: { datos: Retencion }) {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [dias, setDias] = useState(String(datos.retencionDias));
  const [version, setVersion] = useState(datos.politicaVersion);
  const guardar = useMutation({
    mutationFn: () => privacidadApi.guardarRetencion({ retencionDias: Number(dias), politicaVersion: version.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesPrivacidad.retencion });
      notificar.exito('Política guardada');
    },
    onError: (e) => notificar.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  });
  return (
    <Tarjeta
      pie={
        <Boton disabled={!Number.isInteger(Number(dias)) || Number(dias) < 1 || !version.trim()} cargando={guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar
        </Boton>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Días de retención" type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} />
        <Campo etiqueta="Versión de la política" value={version} onChange={(e) => setVersion(e.target.value)} />
        <p className="text-sm text-gray-500 dark:text-gray-400">Visitantes pendientes de anonimizar: {datos.estado.candidatos}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Plantillas de huella vencidas, por purgar: {datos.estado.plantillasVencidas}. La purga corre cada día a las 2:30 a. m. y las plantillas se eliminan a los 12 meses sin visitas.</p>
      </div>
    </Tarjeta>
  );
}
