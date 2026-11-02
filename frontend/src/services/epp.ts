import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { NOMBRE_EPP, type ElementoEpp } from '@/types/api';

export { NOMBRE_EPP };

export const TODOS_ELEMENTOS_EPP = Object.keys(NOMBRE_EPP) as ElementoEpp[];

export type { ElementoEpp };

export interface EntregaEpp {
  id: string;
  visitaId: string;
  elemento: ElementoEpp;
  entregado: boolean;
  devuelto: boolean;
  entregadoEn: string;
  devueltoEn: string | null;
  registradoPorId: string | null;
}

export interface EstadoEpp {
  obligatorios: ElementoEpp[];
  entregados: EntregaEpp[];
  faltantes: ElementoEpp[];
  completo: boolean;
}

export interface ResultadoDevolucion {
  devueltos: ElementoEpp[];
  pendientes: ElementoEpp[];
}

export const clavesEpp = {
  estado: (visitaId: string) => ['epp', 'estado', visitaId] as const,
};

export async function obtenerEstadoEpp(visitaId: string): Promise<EstadoEpp> {
  return apiGet<EstadoEpp>(`/visitas/${visitaId}/epp`);
}

export async function registrarEntregaEpp(
  visitaId: string,
  elementos: { elemento: ElementoEpp; entregado: boolean }[],
): Promise<EstadoEpp> {
  return apiPost<EstadoEpp>(`/visitas/${visitaId}/epp`, { elementos });
}

export async function registrarDevolucionEpp(
  visitaId: string,
  devueltos: ElementoEpp[],
): Promise<ResultadoDevolucion> {
  return apiPatch<ResultadoDevolucion>(`/visitas/${visitaId}/epp/devolucion`, { devueltos });
}
