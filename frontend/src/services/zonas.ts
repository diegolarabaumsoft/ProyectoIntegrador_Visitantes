import { apiGet, apiPatch, apiPost } from '@/lib/api';

export interface Zona {
  id: string;
  nombre: string;
  esSensible: boolean;
  requiereAcompanante: boolean;
  activa: boolean;
}

export interface CrearZonaPayload {
  nombre: string;
  esSensible?: boolean;
  requiereAcompanante?: boolean;
}

export interface ActualizarZonaPayload {
  nombre?: string;
  esSensible?: boolean;
  requiereAcompanante?: boolean;
  activa?: boolean;
}

export interface FiltrosZonas {
  activa?: boolean;
}

export const zonasApi = {
  listar: (filtros?: FiltrosZonas) =>
    apiGet<Zona[]>('/zonas', {
      activa: filtros?.activa !== undefined ? filtros.activa : undefined,
    }),
  crear: (payload: CrearZonaPayload) => apiPost<Zona>('/zonas', payload),
  actualizar: (id: string, payload: ActualizarZonaPayload) => apiPatch<Zona>(`/zonas/${id}`, payload),
  desactivar: (id: string) => apiPatch<Zona>(`/zonas/${id}/desactivar`),
};

export const clavesZonas = {
  todas: ['zonas'] as const,
  lista: (filtros?: FiltrosZonas) => ['zonas', 'lista', filtros] as const,
};
