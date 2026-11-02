import { apiGet } from '@/lib/api';
import type { EventoBitacora, Paginado } from '@/types/api';

/** Debe mantenerse alineado con el enum `TipoEvento` del backend. */
export const TIPOS_EVENTO = [
  'INVITACION_CREADA',
  'INVITACION_REPROGRAMADA',
  'INVITACION_CANCELADA',
  'ENLACE_ENVIADO',
  'PRE_REGISTRO_DATOS',
  'PRE_REGISTRO_COMPLETADO',
  'CONSENTIMIENTO_ACEPTADO',
  'INDUCCION_APROBADA',
  'INDUCCION_REPROBADA',
  'CREDENCIAL_EMITIDA',
  'CREDENCIAL_RECHAZADA',
  'CREDENCIAL_INVALIDADA',
  'CHECKIN_BLOQUEADO',
  'EXCEPCION_REGISTRADA',
  'EPP_ENTREGADO',
  'EPP_DEVUELTO',
  'ACS_AUTORIZADO',
  'ACS_CONTINGENCIA',
  'ACS_RECONCILIADO',
  'CHECKIN_REALIZADO',
  'REGISTRO_EXPRES',
  'MOVIMIENTO_ZONA',
  'ACOMPANANTE_ASIGNADO',
  'VEHICULO_REGISTRADO',
  'ALERTA_PERMANENCIA',
  'CHECKOUT_REALIZADO',
  'INCIDENCIA_DEVOLUCION',
  'RESTRICCION_CREADA',
  'RESTRICCION_MODIFICADA',
  'RESTRICCION_ELIMINADA',
  'USUARIO_CREADO',
  'USUARIO_MODIFICADO',
  'USUARIO_DESACTIVADO',
  'LOGIN_OK',
  'LOGIN_FALLIDO',
  'CUENTA_BLOQUEADA',
  'SESION_CERRADA',
  'NOTIFICACION_ENVIADA',
  'NOTIFICACION_FALLIDA',
  'REPORTE_GENERADO',
  'EXPORTACION_ANONIMIZADA',
  'SOLICITUD_DATOS_REGISTRADA',
  'SOLICITUD_DATOS_ATENDIDA',
  'ANONIMIZACION_RETENCION',
  'CONFIGURACION_MODIFICADA',
  'HUELLA_ENROLADA',
  'COTEJO_EXITOSO',
  'COTEJO_FALLIDO',
  'PRUEBA_VIDA_FALLIDA',
  'PLANTILLA_CARGADA',
  'PLANTILLA_REVOCADA',
  'PLANTILLA_PURGADA',
  'TERMINAL_FUERA_LINEA',
  'TERMINAL_RECUPERADO',
  'PASO_TERMINAL',
] as const;

export interface FiltrosBitacora {
  tipoEvento?: string;
  actor?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}

function consulta(filtros: FiltrosBitacora) {
  return { tipoEvento: filtros.tipoEvento || undefined, actor: filtros.actor || undefined, desde: filtros.desde, hasta: filtros.hasta };
}

export const bitacoraApi = {
  consultar: (filtros: FiltrosBitacora) => apiGet<Paginado<EventoBitacora>>('/bitacora', { ...consulta(filtros), pagina: filtros.pagina }),
};

export const clavesBitacora = {
  todas: ['bitacora'] as const,
  lista: (filtros: FiltrosBitacora) => ['bitacora', 'lista', filtros] as const,
};
