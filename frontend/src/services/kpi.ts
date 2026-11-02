import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';

export type NombreIndicador = 'TIEMPO_CHECKIN_P90' | 'TIEMPO_CHECKIN_PROMEDIO' | 'COMPLETITUD_REGISTRO' | 'SATISFACCION' | 'VISITAS_DIA' | 'BLOQUEOS' | 'CONTINGENCIAS' | 'TASA_RECHAZO_BIOMETRICO' | 'TIEMPO_CHECKIN_P90_ENROLADO' | 'TIEMPO_CHECKIN_P90_PRIMERA_VISITA';

export const NOMBRE_INDICADOR: Record<NombreIndicador, string> = {
  TIEMPO_CHECKIN_P90: 'Tiempo de check-in p90 (s)',
  TIEMPO_CHECKIN_PROMEDIO: 'Tiempo promedio de check-in (s)',
  COMPLETITUD_REGISTRO: 'Completitud del registro (%)',
  SATISFACCION: 'Satisfacción (1 a 5)',
  VISITAS_DIA: 'Visitas del día',
  BLOQUEOS: 'Bloqueos',
  CONTINGENCIAS: 'Contingencias',
  TASA_RECHAZO_BIOMETRICO: 'Tasa de rechazo biométrico (%)',
  TIEMPO_CHECKIN_P90_ENROLADO: 'Check-in p90 con huella ya enrolada (s)',
  TIEMPO_CHECKIN_P90_PRIMERA_VISITA: 'Check-in p90 con enrolamiento (s)',
};

export interface Tablero {
  periodo: string | null;
  calculadoEn: string | null;
  valores: Partial<Record<NombreIndicador, number>>;
  serie: { dia: string; valor: number }[];
}

export interface Reporte {
  id: string;
  tipo: string;
  periodicidad: string | null;
  desde: string;
  hasta: string;
  generadoEn: string;
  generadoPor: string | null;
}

export interface Programacion {
  periodicidad: string | null;
  destinatarios: string[];
}

export interface AlertaUmbral {
  id: string;
  indicador: NombreIndicador;
  umbral: number;
  operador: 'MAYOR' | 'MENOR';
  destinatarios: string[];
  activa: boolean;
}

export type DatosAlerta = Omit<AlertaUmbral, 'id' | 'activa'>;

export const kpiApi = {
  tablero: () => apiGet<Tablero>('/kpi/tablero'),
  recalcular: (fecha: string) => apiPost<unknown>(`/kpi/recalcular?fecha=${fecha}`),
  reportes: () => apiGet<Reporte[]>('/reportes'),
  generar: (datos: { tipo: string; desde: string; hasta: string }) => apiPost<Reporte>('/reportes/generar', datos),
  programacion: () => apiGet<Programacion>('/reportes/programacion'),
  guardarProgramacion: (datos: Programacion) => apiPut<Programacion>('/reportes/programacion', datos),
  alertas: () => apiGet<AlertaUmbral[]>('/alertas-umbral'),
  crearAlerta: (datos: DatosAlerta) => apiPost<AlertaUmbral>('/alertas-umbral', datos),
  actualizarAlerta: (id: string, datos: Partial<AlertaUmbral>) => apiPatch<AlertaUmbral>(`/alertas-umbral/${id}`, datos),
  eliminarAlerta: (id: string) => apiDelete<void>(`/alertas-umbral/${id}`),
};

export const clavesKpi = {
  tablero: ['kpi', 'tablero'] as const,
  reportes: ['kpi', 'reportes'] as const,
  programacion: ['kpi', 'programacion'] as const,
  alertas: ['kpi', 'alertas'] as const,
};
