'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Cargando } from '@/components/ui/cargando';
import { ApiError } from '@/lib/api';
import { clavesPreRegistro, preRegistroApi, type EstadoPreRegistro, type ResultadoInduccion } from '@/services/pre-registro';
import { PasoConsentimiento } from './pasos/consentimiento';
import { PasoCredencial } from './pasos/credencial';
import { PasoDatos } from './pasos/datos';
import { PasoHuella } from './pasos/huella';
import { EnlaceNoDisponible } from './pasos/enlace-no-disponible';
import { PasoInduccion } from './pasos/induccion';
import { PasoResultado } from './pasos/resultado';
import { Bienvenida } from './pasos/bienvenida';

export type Vista = 'BIENVENIDA' | 'DATOS' | 'CONSENTIMIENTO' | 'INDUCCION' | 'RESULTADO' | 'CREDENCIAL' | 'HUELLA';

/**
 * Portal del visitante (V1 a V7): asistente de tres pasos (RNF-05).
 * El servidor es la fuente de verdad del paso actual; esta vista solo
 * decide qué pantalla mostrar y nunca emite la credencial por su cuenta.
 */
export function Asistente({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [vistaElegida, setVista] = useState<Vista | null>(null);
  const [resultado, setResultado] = useState<ResultadoInduccion | null>(null);

  const { data, error, isPending } = useQuery({
    queryKey: clavesPreRegistro.estado(token),
    queryFn: () => preRegistroApi.estado(token),
    retry: false,
  });

  function actualizarEstado(estado: EstadoPreRegistro) {
    queryClient.setQueryData(clavesPreRegistro.estado(token), estado);
  }

  if (error) {
    const e = error instanceof ApiError ? error : null;
    return <EnlaceNoDisponible codigo={e?.codigo ?? 'ERROR'} mensaje={e?.message ?? 'No fue posible cargar el enlace.'} detalles={e?.detalles} />;
  }
  if (isPending || !data) return <Cargando texto="Cargando su invitación…" />;

  // Vista inicial derivada del estado del servidor; después manda la navegación local
  const vista: Vista = vistaElegida ?? (data.paso === 'CREDENCIAL' || data.paso === 'HUELLA' ? data.paso : 'BIENVENIDA');

  switch (vista) {
    case 'BIENVENIDA':
      return <Bienvenida estado={data} onComenzar={() => setVista(data.paso)} />;
    case 'DATOS':
      return (
        <PasoDatos
          token={token}
          estado={data}
          onListo={(estado) => {
            actualizarEstado(estado);
            setVista('CONSENTIMIENTO');
          }}
        />
      );
    case 'CONSENTIMIENTO':
      return (
        <PasoConsentimiento
          token={token}
          estado={data}
          onAtras={() => setVista('DATOS')}
          onListo={(estado) => {
            actualizarEstado(estado);
            setVista('INDUCCION');
          }}
        />
      );
    case 'INDUCCION':
      return (
        <PasoInduccion
          token={token}
          onAtras={() => setVista('CONSENTIMIENTO')}
          onResultado={(r) => {
            setResultado(r);
            setVista('RESULTADO');
          }}
          onCredencial={(estado) => {
            actualizarEstado(estado);
            setVista(estado.paso === 'HUELLA' ? 'HUELLA' : 'CREDENCIAL');
          }}
        />
      );
    case 'RESULTADO':
      return resultado ? (
        <PasoResultado
          token={token}
          resultado={resultado}
          onRepetir={() => setVista('INDUCCION')}
          onCredencial={(estado) => {
            actualizarEstado(estado);
            setVista(estado.paso === 'HUELLA' ? 'HUELLA' : 'CREDENCIAL');
          }}
        />
      ) : (
        <Alerta tipo="error">No hay resultado de inducción.</Alerta>
      );
    case 'CREDENCIAL':
      return <PasoCredencial token={token} />;
    case 'HUELLA':
      return <PasoHuella estado={data} />;
  }
}
