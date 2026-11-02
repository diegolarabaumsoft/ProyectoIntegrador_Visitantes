'use client';

import { StarIcon } from '@heroicons/react/20/solid';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Cargando } from '@/components/ui/cargando';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

/** V8 · Encuesta de satisfacción, móvil. Adaptado de Tailwind Plus · layout/cards. */
export function EncuestaSatisfaccion({ token }: { token: string }) {
  const [puntaje, setPuntaje] = useState(0);
  const { data, isPending, error } = useQuery({ queryKey: ['encuesta', token], queryFn: () => apiGet<{ respondida: boolean }>(`/encuesta/${token}`), retry: false });
  const enviar = useMutation({ mutationFn: () => apiPost<unknown>(`/encuesta/${token}`, { puntaje }) });

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">¿Cómo fue su visita?</h1>
      {isPending ? <Cargando /> : null}
      {error ? <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo abrir la encuesta.'}</Alerta> : null}
      {data?.respondida || enviar.isSuccess ? <Alerta tipo="exito" titulo="¡Gracias!">Su respuesta quedó registrada.</Alerta> : null}
      {data && !data.respondida && !enviar.isSuccess ? (
        <Tarjeta
          pie={
            <Boton bloque tamano="xl" disabled={puntaje === 0} cargando={enviar.isPending} onClick={() => enviar.mutate()}>
              Enviar
            </Boton>
          }
        >
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${n} de 5`} aria-pressed={puntaje === n} onClick={() => setPuntaje(n)}>
                <StarIcon aria-hidden="true" className={cn('size-10', n <= puntaje ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600')} />
              </button>
            ))}
          </div>
          {enviar.isError ? <Alerta tipo="error" className="mt-4">{enviar.error instanceof ApiError ? enviar.error.message : 'No se pudo enviar.'}</Alerta> : null}
        </Tarjeta>
      ) : null}
    </div>
  );
}
