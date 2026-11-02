import { apiGet, apiPost } from '@/lib/api';
import type { ElementoEpp } from '@/types/api';

export interface FichaCheckOut {
  visita: { id: string; horaIngreso: string; tiempoAutorizadoMin: number; motivo: string };
  visitante: { nombreCompleto: string; empresa: string };
  anfitrion: string;
  epp: ElementoEpp[];
  tieneCredencial: boolean;
  usaTerminales: boolean;
}

export type ResultadoEscaneoSalida = { resultado: 'VALIDA'; ficha: FichaCheckOut } | { resultado: 'RECHAZADO'; motivo: string; mensaje: string };

export interface ResultadoCheckOut {
  visitaId: string;
  visitante: { nombreCompleto: string; empresa: string };
  horaSalida: string;
  incidencias: string[];
  acs: { contingencia: boolean; detalle: string };
}

export interface SalidaReciente {
  visitaId: string;
  visitante: { nombreCompleto: string; empresa: string };
  horaSalida: string;
  terminal: string | null;
  revocacionesPendientes: number;
}

export const checkOutApi = {
  salidasRecientes: () => apiGet<SalidaReciente[]>('/check-out/salidas-recientes'),
  escanear: (entrada: { codigo: string } | { visitaId: string }) => apiPost<ResultadoEscaneoSalida>('/check-out/escanear', entrada),
  devolucion: (visitaId: string, datos: { credencialDevuelta: boolean; eppDevuelto: ElementoEpp[] }) => apiPost<{ pendientes: ElementoEpp[] }>(`/check-out/${visitaId}/devolucion`, datos),
  confirmar: (visitaId: string, datos: { credencialDevuelta: boolean; eppDevuelto: ElementoEpp[] }) => apiPost<ResultadoCheckOut>(`/check-out/${visitaId}/confirmar`, datos),
};

export const clavesCheckOut = {
  todas: ['check-out'] as const,
  salidas: ['check-out', 'salidas'] as const,
};
