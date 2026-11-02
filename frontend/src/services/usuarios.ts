import { apiGet, apiPatch, apiPost } from '@/lib/api';
import type { Rol } from '@/lib/roles';
import type { Paginado } from '@/types/api';

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  area: string | null;
  activo: boolean;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
}

export interface DatosUsuario {
  nombre: string;
  correo: string;
  rol: Rol;
  area?: string;
}

export interface FiltrosUsuarios {
  rol?: Rol;
  activo?: boolean;
  pagina?: number;
}

export const usuariosApi = {
  listar: (filtros: FiltrosUsuarios) => apiGet<Paginado<Usuario>>('/usuarios', { rol: filtros.rol, activo: filtros.activo, pagina: filtros.pagina }),
  crear: (datos: DatosUsuario) => apiPost<Usuario & { correoEnviado: boolean }>('/usuarios', datos),
  actualizar: (id: string, datos: DatosUsuario) => apiPatch<Usuario>(`/usuarios/${id}`, datos),
  desactivar: (id: string) => apiPatch<Usuario>(`/usuarios/${id}/desactivar`),
  reactivar: (id: string) => apiPatch<Usuario>(`/usuarios/${id}/reactivar`),
  desbloquear: (id: string) => apiPatch<Usuario>(`/usuarios/${id}/desbloquear`),
  restablecer: (id: string) => apiPatch<Usuario & { correoEnviado: boolean }>(`/usuarios/${id}/restablecer-contrasena`),
};

export const clavesUsuarios = {
  todas: ['usuarios'] as const,
  lista: (filtros: FiltrosUsuarios) => ['usuarios', 'lista', filtros] as const,
};
