'use client';

import { ArrowPathIcon, QrCodeIcon } from '@heroicons/react/20/solid';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Insignia } from '@/components/ui/insignia';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFecha } from '@/lib/fechas';
import { preRegistroApi, type EstadoPreRegistro, type ResultadoInduccion } from '@/services/pre-registro';

interface Props {
  token: string;
  resultado: ResultadoInduccion;
  onRepetir: () => void;
  onCredencial: (estado: EstadoPreRegistro) => void;
}

/** V5a · Resultado aprobado / V5b · Resultado no aprobado. */
export function PasoResultado({ token, resultado, onRepetir, onCredencial }: Props) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const finalizar = useMutation({
    mutationFn: () => preRegistroApi.finalizar(token),
    onSuccess: (r) => onCredencial(r.estado),
    onError: (e) => setErrorGeneral(e instanceof ApiError ? e.message : 'No fue posible finalizar el pre-registro'),
  });

  return (
    <div className="space-y-6">
      <div className="text-center">
        <Insignia color={resultado.aprobada ? 'verde' : 'rojo'}>{resultado.aprobada ? 'Inducción aprobada' : 'Inducción no aprobada'}</Insignia>
        <p className={`mt-4 text-6xl font-bold tracking-tight ${resultado.aprobada ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {resultado.puntaje} %
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Puntaje mínimo: {resultado.puntajeMinimo} % · {resultado.correctas} de {resultado.total} respuestas correctas
        </p>
      </div>

      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}

      {resultado.aprobada ? (
        <>
          <Tarjeta titulo="¿Qué sigue?">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Su inducción es válida hasta el {resultado.venceEn ? formatearFecha(resultado.venceEn) : '—'}. Finalice su pre-registro para conocer cómo
              identificarse en recepción.
            </p>
          </Tarjeta>
          <Boton bloque tamano="xl" iconoInicio={QrCodeIcon} cargando={finalizar.isPending} onClick={() => finalizar.mutate()}>
            Finalizar pre-registro
          </Boton>
        </>
      ) : (
        <>
          <Tarjeta titulo="Puede intentarlo de nuevo">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Revise el video y las normas de seguridad antes de repetir la evaluación. No hay límite de intentos; sin la inducción aprobada no es
              posible completar el pre-registro.
            </p>
          </Tarjeta>
          <Boton bloque tamano="xl" iconoInicio={ArrowPathIcon} onClick={onRepetir}>
            Repetir inducción
          </Boton>
        </>
      )}
    </div>
  );
}
