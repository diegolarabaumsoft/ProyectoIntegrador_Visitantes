import type { Rol } from '@/lib/roles';

/** Formato uniforme de error que devuelve la API (HttpExceptionFilter). */
export interface RespuestaError {
  statusCode: number;
  codigo: string;
  mensaje: string;
  detalles?: unknown;
  ruta: string;
  fecha: string;
}

export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  debeCambiarContrasena?: boolean;
}

export type EstadoVisita = 'PROGRAMADA' | 'PRE_REGISTRADA' | 'EN_PLANTA' | 'FINALIZADA' | 'CANCELADA' | 'BLOQUEADA';

export const NOMBRE_ESTADO_VISITA: Record<EstadoVisita, string> = {
  PROGRAMADA: 'Programada',
  PRE_REGISTRADA: 'Pre-registrada',
  EN_PLANTA: 'En planta',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  BLOQUEADA: 'Bloqueada',
};

export type TipoDocumento = 'CC' | 'CE' | 'PASAPORTE' | 'OTRO';

export const NOMBRE_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  PASAPORTE: 'Pasaporte',
  OTRO: 'Otro',
};

export type ElementoEpp = 'CASCO' | 'GAFAS' | 'TAPABOCAS' | 'PROTECTOR_AUDITIVO' | 'CHALECO' | 'BOTAS' | 'OTRO';

export const NOMBRE_EPP: Record<ElementoEpp, string> = {
  CASCO: 'Casco',
  GAFAS: 'Gafas de seguridad',
  TAPABOCAS: 'Tapabocas',
  PROTECTOR_AUDITIVO: 'Protector auditivo',
  CHALECO: 'Chaleco reflectivo',
  BOTAS: 'Botas de seguridad',
  OTRO: 'Otro',
};

export interface EventoBitacora {
  id: string;
  fechaHora: string;
  tipoEvento: string;
  actor: string;
  actorId: string | null;
  visitaId: string | null;
  entidad: string | null;
  entidadId: string | null;
  resultado: string;
  detalle: Record<string, unknown> | null;
  ip: string | null;
}

export interface EstadoSalud {
  estado: 'ok' | 'degradado';
  baseDatos: 'ok' | 'error';
  fecha: string;
}
