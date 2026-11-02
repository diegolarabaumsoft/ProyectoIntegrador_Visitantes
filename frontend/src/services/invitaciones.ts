import { apiGet, apiPatch, apiPost } from '@/lib/api';
import type { EstadoVisita, EventoBitacora, Paginado, TipoDocumento } from '@/types/api';

export interface FilaVisita {
  id: string;
  invitacionId: string | null;
  estado: EstadoVisita;
  fechaProgramada: string;
  motivo: string;
  tiempoAutorizadoMin: number;
  esGrupal: boolean;
  vencimientoEnlace: string | null;
  visitante: { id: string; nombreCompleto: string; empresa: string; correo: string };
  anfitrion: { id: string; nombre: string };
  credencialEmitida: boolean;
  preRegistroCompleto: boolean;
}

export interface ListadoVisitas extends Paginado<FilaVisita> {
  porEstado: Partial<Record<EstadoVisita, number>>;
}

export interface VisitanteInvitado {
  nombreCompleto: string;
  correo: string;
  empresa: string;
  tipoDocumento?: TipoDocumento;
  numeroDocumento?: string;
}

export interface CrearInvitacion {
  fechaVisita: string;
  motivo: string;
  tiempoAutorizadoMin?: number;
  visitantes: VisitanteInvitado[];
}

export interface RespuestaCrear {
  invitacionId: string;
  esGrupal: boolean;
  visitas: FilaVisita[];
}

export interface DetalleInvitacion {
  id: string;
  estado: 'ACTIVA' | 'REPROGRAMADA' | 'CANCELADA';
  fechaVisita: string;
  motivo: string;
  esGrupal: boolean;
  anfitrion: { id: string; nombre: string; area: string | null };
  createdAt: string;
  visitas: FilaVisita[];
}

export interface FiltrosVisitas {
  estado?: EstadoVisita | '';
  q?: string;
  pagina?: number;
  limite?: number;
}

export const invitacionesApi = {
  listar: (filtros: FiltrosVisitas) => apiGet<ListadoVisitas>('/invitaciones', { ...filtros, estado: filtros.estado || undefined }),
  detalle: (id: string) => apiGet<DetalleInvitacion>(`/invitaciones/${id}`),
  crear: (datos: CrearInvitacion) => apiPost<RespuestaCrear>('/invitaciones', datos),
  reprogramar: (id: string, fechaVisita: string) => apiPatch<DetalleInvitacion>(`/invitaciones/${id}/reprogramar`, { fechaVisita }),
  cancelar: (id: string) => apiPatch<DetalleInvitacion>(`/invitaciones/${id}/cancelar`),
  reenviarEnlace: (visitaId: string) => apiPost<FilaVisita>(`/invitaciones/visitas/${visitaId}/reenviar-enlace`),
  bitacoraVisita: (visitaId: string) => apiGet<EventoBitacora[]>(`/bitacora/visita/${visitaId}`),
};

export const clavesInvitaciones = {
  lista: (filtros: FiltrosVisitas) => ['invitaciones', 'lista', filtros] as const,
  detalle: (id: string) => ['invitaciones', 'detalle', id] as const,
  bitacora: (visitaId: string) => ['bitacora', 'visita', visitaId] as const,
};
