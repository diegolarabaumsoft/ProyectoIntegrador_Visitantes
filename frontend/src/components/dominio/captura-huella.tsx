'use client';

import { FingerPrintIcon } from '@heroicons/react/20/solid';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { ApiError } from '@/lib/api';
import { huellero, MENSAJE_CAPTURA } from '@/lib/huellero';
import { biometriaApi, type ResultadoIdentificacion } from '@/services/biometria';

const MENSAJE_RESULTADO: Record<Exclude<ResultadoIdentificacion['resultado'], 'COINCIDE'>, string> = {
  NO_COINCIDE: 'La huella no coincide con ningún visitante de hoy.',
  CALIDAD_BAJA: MENSAJE_CAPTURA.CALIDAD_BAJA,
  PRUEBA_VIDA_FALLIDA: MENSAJE_CAPTURA.PRUEBA_VIDA_FALLIDA,
};

/** Captura e identifica una huella (HU-07): tras los intentos configurados se ofrece el flujo alternativo. */
export function CapturaHuella({ onIdentificada }: { onIdentificada: (visitaId: string) => void }) {
  const [fallos, setFallos] = useState(0);
  const [intentosMaximos, setIntentosMaximos] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const identificar = useMutation({
    mutationFn: async () => {
      const captura = await huellero.capturar('IDENTIFICAR');
      // Un lector desconectado no es un rechazo biométrico: no se registra como intento
      if (!captura.ok && captura.motivo === 'LECTOR_DESCONECTADO') throw new Error(MENSAJE_CAPTURA.LECTOR_DESCONECTADO);
      return biometriaApi.identificar(captura);
    },
    onMutate: () => setAviso(null),
    onSuccess: (r) => {
      setIntentosMaximos(r.intentosMaximos);
      if (r.resultado === 'COINCIDE') {
        setFallos(0);
        onIdentificada(r.visitaId);
        return;
      }
      setFallos((n) => n + 1);
      setAviso(MENSAJE_RESULTADO[r.resultado]);
    },
    onError: (e) => setAviso(e instanceof ApiError || e instanceof Error ? e.message : 'No fue posible leer el huellero'),
  });

  const agotados = intentosMaximos !== null && fallos >= intentosMaximos;

  return (
    <div className="space-y-3">
      {aviso ? <Alerta tipo="error">{aviso}</Alerta> : null}
      {agotados ? (
        <Alerta tipo="advertencia" titulo="Use el flujo alternativo">
          Se agotaron los {intentosMaximos} intentos. Busque al visitante por documento y use la credencial alternativa, con las mismas validaciones.
        </Alerta>
      ) : null}
      {agotados ? (
        <Boton
          variante="secundario"
          onClick={() => {
            setFallos(0);
            setAviso(null);
          }}
        >
          Atender a otro visitante
        </Boton>
      ) : (
        <Boton iconoInicio={FingerPrintIcon} cargando={identificar.isPending} onClick={() => identificar.mutate()}>
          Capturar huella
        </Boton>
      )}
      {fallos > 0 && !agotados && intentosMaximos !== null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Intento {fallos} de {intentosMaximos}
        </p>
      ) : null}
    </div>
  );
}
