import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { EventoBitacora, Paginado } from '@/types/api';

export interface EntradaRestriccion {
  id: string;
  numeroDocumento: string;
  nombreReferencia: string;
  motivo: string;
  fechaRegistro: string;
  activa: boolean;
  autor: { id: string; nombre: string; correo: string };
  actualizadoPorId: string | null;
  updatedAt: string;
}

export interface FiltrosRestricciones {
  q?: string;
  activa?: boolean;
  pagina?: number;
  limite?: number;
}

export interface CrearRestriccionPayload {
  numeroDocumento: string;
  nombreReferencia: string;
  motivo: string;
}

export interface ActualizarRestriccionPayload {
  nombreReferencia?: string;
  motivo?: string;
}

export const restriccionesApi = {
  listar: (filtros: FiltrosRestricciones) =>
    apiGet<Paginado<EntradaRestriccion>>('/restricciones', {
      q: filtros.q || undefined,
      activa: filtros.activa !== undefined ? filtros.activa : true,
      pagina: filtros.pagina,
      limite: filtros.limite,
    }),
  crear: (payload: CrearRestriccionPayload) =>
    apiPost<EntradaRestriccion>('/restricciones', payload),
  actualizar: (id: string, payload: ActualizarRestriccionPayload) =>
    apiPatch<EntradaRestriccion>(`/restricciones/${id}`, payload),
  eliminar: (id: string) =>
    apiDelete<void>(`/restricciones/${id}`),
  historial: (id: string, pagina = 1, limite = 10) =>
    apiGet<Paginado<EventoBitacora>>(`/restricciones/${id}/historial`, { pagina, limite }),
};

export const clavesRestricciones = {
  todas: ['restricciones'] as const,
  lista: (filtros: FiltrosRestricciones) => ['restricciones', 'lista', filtros] as const,
  historial: (id: string) => ['restricciones', 'historial', id] as const,
};
