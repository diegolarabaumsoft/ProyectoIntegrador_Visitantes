'use client';

import { useEffect, useState } from 'react';
import { Insignia } from '@/components/ui/insignia';

/** Insignia «Actualizado hace n s»; se pone en amarillo si los datos llevan más de 30 s sin renovarse. */
export function ActualizadoHace({ fecha }: { fecha: string | undefined }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, []);
  if (!fecha) return null;
  const segundos = Math.max(0, Math.round((ahora - new Date(fecha).getTime()) / 1000));
  return <Insignia color={segundos > 30 ? 'amarillo' : 'verde'}>Actualizado hace {segundos} s</Insignia>;
}
