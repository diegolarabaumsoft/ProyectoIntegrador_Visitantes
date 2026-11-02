'use client';

import { useQuery } from '@tanstack/react-query';
import { Insignia } from '@/components/ui/insignia';
import { huellero } from '@/lib/huellero';
import { clavesBiometria } from '@/services/biometria';

/** Estado del lector. El modo simulado siempre se anuncia: no debe confundirse con un huellero real. */
export function EstadoHuellero() {
  const { data, isError, isPending } = useQuery({ queryKey: clavesBiometria.huellero, queryFn: huellero.estado, refetchInterval: 5_000, retry: false });
  if (isPending) return null;
  if (isError || !data) return <Insignia color="rojo">Huellero sin conexión</Insignia>;
  if (!data.conectado) return <Insignia color="rojo">Huellero desconectado</Insignia>;
  return data.modo === 'SIMULADO' ? <Insignia color="amarillo">Huellero simulado</Insignia> : <Insignia color="verde">Huellero conectado</Insignia>;
}
