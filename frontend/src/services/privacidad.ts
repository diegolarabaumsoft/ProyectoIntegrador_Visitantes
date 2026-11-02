import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';

export type TipoSolicitud = 'ELIMINACION' | 'ANONIMIZACION' | 'CONSULTA' | 'REVOCACION_BIOMETRICA';

export const NOMBRE_TIPO_SOLICITUD: Record<TipoSolicitud, string> = { ELIMINACION: 'Eliminación', ANONIMIZACION: 'Anonimización', CONSULTA: 'Consulta', REVOCACION_BIOMETRICA: 'Revocación de huella' };

export interface Solicitud {
  id: string;
  tipo: TipoSolicitud;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'ATENDIDA' | 'VENCIDA';
  fechaRecepcion: string;
  fechaLimite: string;
  fechaRespuesta: string | null;
  respuesta: string | null;
  titular: string;
  atendidaPor: string | null;
}

export interface DatosTitular {
  nombreCompleto: string;
  numeroDocumento: string;
  empresa: string;
  correo: string;
  telefono: string | null;
  visitas: { id: string; fechaProgramada: string; estado: string; motivo: string }[];
}

export interface Retencion {
  retencionDias: number;
  politicaVersion: string;
  estado: { candidatos: number; plantillasVencidas: number; ultimaPurga?: string | null; ultimaEjecucion?: string | null };
}

export const privacidadApi = {
  solicitudes: () => apiGet<Solicitud[]>('/privacidad/solicitudes'),
  registrar: (datos: { tipo: TipoSolicitud; numeroDocumento: string }) => apiPost<unknown>('/privacidad/solicitudes', datos),
  datos: (id: string) => apiGet<DatosTitular>(`/privacidad/solicitudes/${id}/datos`),
  atender: (id: string, respuesta: string) => apiPatch<unknown>(`/privacidad/solicitudes/${id}/atender`, { respuesta }),
  retencion: () => apiGet<Retencion>('/privacidad/retencion'),
  guardarRetencion: (datos: { retencionDias: number; politicaVersion: string }) => apiPut<Retencion>('/privacidad/retencion', datos),
};

export const clavesPrivacidad = {
  solicitudes: ['privacidad', 'solicitudes'] as const,
  retencion: ['privacidad', 'retencion'] as const,
};
