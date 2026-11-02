import { apiGet, apiPost } from '@/lib/api';
import type { Paginado } from '@/types/api';

export interface Notificacion {
  id: string;
  destinatario: string;
  asunto: string;
  tipo: string;
  estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
  intentos: number;
  error: string | null;
  createdAt: string;
}

export const notificacionesApi = {
  listar: (f: { estado?: string; pagina?: number }) => apiGet<Paginado<Notificacion>>('/notificaciones', f),
  reintentar: (id: string) => apiPost<Notificacion>(`/notificaciones/${id}/reintentar`),
};

export const clavesNotificaciones = {
  todas: ['notificaciones'] as const,
  lista: (f: { estado?: string; pagina?: number }) => ['notificaciones', 'lista', f] as const,
};
