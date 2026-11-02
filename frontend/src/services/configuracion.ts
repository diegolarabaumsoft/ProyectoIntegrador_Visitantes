import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';

export interface Parametro {
  clave: string;
  valor: unknown;
  descripcion: string | null;
}

export interface Pregunta {
  id: string;
  enunciado: string;
  opciones: string[];
  respuestaCorrecta: number;
  activa: boolean;
  orden: number;
}

export type DatosPregunta = Pick<Pregunta, 'enunciado' | 'opciones' | 'respuestaCorrecta' | 'orden'>;

export interface EstadoAcs {
  modo: string;
  comportamiento?: string;
  destino?: string;
  timeoutMs: number;
  pendientes: number;
}

export const configuracionApi = {
  parametros: () => apiGet<Parametro[]>('/configuracion'),
  guardar: (clave: string, valor: unknown) => apiPut<unknown>(`/configuracion/${clave}`, { valor }),
  preguntas: () => apiGet<Pregunta[]>('/induccion/preguntas'),
  crearPregunta: (datos: DatosPregunta) => apiPost<Pregunta>('/induccion/preguntas', datos),
  actualizarPregunta: (id: string, datos: DatosPregunta) => apiPatch<Pregunta>(`/induccion/preguntas/${id}`, datos),
  desactivarPregunta: (id: string) => apiPatch<Pregunta>(`/induccion/preguntas/${id}/desactivar`),
  estadoAcs: () => apiGet<EstadoAcs>('/integraciones/acs/estado'),
};

export const clavesConfiguracion = {
  parametros: ['configuracion', 'parametros'] as const,
  preguntas: ['configuracion', 'preguntas'] as const,
  acs: ['configuracion', 'acs'] as const,
};
