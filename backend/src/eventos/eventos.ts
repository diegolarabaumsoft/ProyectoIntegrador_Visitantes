import type { TipoEvento } from '../generated/prisma/enums.js';

/**
 * Eventos de dominio (patrón Observador, sección 7.5 del plan).
 *
 * Los módulos de negocio publican eventos a través de `PublicadorEventos`;
 * bitácora, notificaciones y KPI se suscriben sin que el emisor los conozca.
 * Todo evento se emite bajo el espacio `vms.*` y lleva el `TipoEvento` con el
 * que debe quedar registrado en la bitácora.
 */
export const PREFIJO_EVENTO = 'vms';

export interface EventoDominio {
  /** Tipo con el que se registra en la bitácora */
  tipo: TipoEvento;
  /** Nombre del usuario que origina la acción, o "SISTEMA" */
  actor: string;
  actorId?: string | null;
  visitaId?: string | null;
  entidad?: string;
  entidadId?: string;
  resultado: string;
  detalle?: Record<string, unknown>;
  ip?: string;
  /** Momento de emisión; lo completa el publicador */
  fecha?: Date;
}

export const ACTOR_SISTEMA = 'SISTEMA';

/** Nombres de evento. Cada módulo añade los suyos aquí para mantener un catálogo único. */
export const Eventos = {
  // Invitaciones y pre-registro
  INVITACION_CREADA: `${PREFIJO_EVENTO}.invitacion.creada`,
  INVITACION_REPROGRAMADA: `${PREFIJO_EVENTO}.invitacion.reprogramada`,
  INVITACION_CANCELADA: `${PREFIJO_EVENTO}.invitacion.cancelada`,
  PRE_REGISTRO_COMPLETADO: `${PREFIJO_EVENTO}.preregistro.completado`,
  CONSENTIMIENTO_ACEPTADO: `${PREFIJO_EVENTO}.preregistro.consentimiento`,
  INDUCCION_EVALUADA: `${PREFIJO_EVENTO}.induccion.evaluada`,
  CREDENCIAL_EMITIDA: `${PREFIJO_EVENTO}.credencial.emitida`,
  /** Emitida en recepción (HU-40): sin correo, porque el visitante está presente */
  CREDENCIAL_ALTERNATIVA: `${PREFIJO_EVENTO}.credencial.alternativa`,
  CREDENCIAL_RECHAZADA: `${PREFIJO_EVENTO}.credencial.rechazada`,
  CREDENCIAL_INVALIDADA: `${PREFIJO_EVENTO}.credencial.invalidada`,
  // Check-in / permanencia / check-out
  CHECKIN_BLOQUEADO: `${PREFIJO_EVENTO}.checkin.bloqueado`,
  EXCEPCION_REGISTRADA: `${PREFIJO_EVENTO}.checkin.excepcion`,
  EPP_REGISTRADO: `${PREFIJO_EVENTO}.checkin.epp`,
  EPP_DEVUELTO: `${PREFIJO_EVENTO}.checkout.epp.devuelto`,
  ACS_RESPONDIO: `${PREFIJO_EVENTO}.acs.autorizado`,
  ACS_CONTINGENCIA: `${PREFIJO_EVENTO}.acs.contingencia`,
  ACS_RECONCILIADO: `${PREFIJO_EVENTO}.acs.reconciliado`,
  CHECKIN_REALIZADO: `${PREFIJO_EVENTO}.checkin.realizado`,
  REGISTRO_EXPRES: `${PREFIJO_EVENTO}.checkin.expres`,
  MOVIMIENTO_ZONA: `${PREFIJO_EVENTO}.permanencia.movimiento`,
  ACOMPANANTE_ASIGNADO: `${PREFIJO_EVENTO}.permanencia.acompanante`,
  VEHICULO_REGISTRADO: `${PREFIJO_EVENTO}.permanencia.vehiculo`,
  ALERTA_PERMANENCIA: `${PREFIJO_EVENTO}.permanencia.alerta`,
  CHECKOUT_REALIZADO: `${PREFIJO_EVENTO}.checkout.realizado`,
  SATISFACCION_REGISTRADA: `${PREFIJO_EVENTO}.checkout.satisfaccion`,
  VISITA_VENCIDA: `${PREFIJO_EVENTO}.visita.vencida`,
  INCIDENCIA_DEVOLUCION: `${PREFIJO_EVENTO}.checkout.incidencia`,
  // Administración y seguridad
  RESTRICCION_CREADA: `${PREFIJO_EVENTO}.restriccion.creada`,
  RESTRICCION_MODIFICADA: `${PREFIJO_EVENTO}.restriccion.modificada`,
  RESTRICCION_ELIMINADA: `${PREFIJO_EVENTO}.restriccion.eliminada`,
  USUARIO_CREADO: `${PREFIJO_EVENTO}.usuario.creado`,
  USUARIO_MODIFICADO: `${PREFIJO_EVENTO}.usuario.modificado`,
  USUARIO_DESACTIVADO: `${PREFIJO_EVENTO}.usuario.desactivado`,
  LOGIN_EXITOSO: `${PREFIJO_EVENTO}.auth.login.ok`,
  LOGIN_FALLIDO: `${PREFIJO_EVENTO}.auth.login.fallido`,
  CUENTA_BLOQUEADA: `${PREFIJO_EVENTO}.auth.bloqueada`,
  SESION_CERRADA: `${PREFIJO_EVENTO}.auth.logout`,
  // Notificaciones, reportes y privacidad
  NOTIFICACION_ENVIADA: `${PREFIJO_EVENTO}.notificacion.enviada`,
  NOTIFICACION_FALLIDA: `${PREFIJO_EVENTO}.notificacion.fallida`,
  REPORTE_GENERADO: `${PREFIJO_EVENTO}.reporte.generado`,
  EXPORTACION_ANONIMIZADA: `${PREFIJO_EVENTO}.privacidad.exportacion`,
  SOLICITUD_DATOS_REGISTRADA: `${PREFIJO_EVENTO}.privacidad.solicitud.registrada`,
  SOLICITUD_DATOS_ATENDIDA: `${PREFIJO_EVENTO}.privacidad.solicitud`,
  ANONIMIZACION_EJECUTADA: `${PREFIJO_EVENTO}.privacidad.anonimizacion`,
  CONFIGURACION_MODIFICADA: `${PREFIJO_EVENTO}.configuracion.modificada`,
  // Biometría y terminales
  HUELLA_ENROLADA: `${PREFIJO_EVENTO}.biometria.enrolada`,
  COTEJO_EXITOSO: `${PREFIJO_EVENTO}.biometria.cotejo.exitoso`,
  COTEJO_FALLIDO: `${PREFIJO_EVENTO}.biometria.cotejo.fallido`,
  PRUEBA_VIDA_FALLIDA: `${PREFIJO_EVENTO}.biometria.prueba_vida.fallida`,
  PLANTILLA_CARGADA: `${PREFIJO_EVENTO}.terminal.plantilla.cargada`,
  PLANTILLA_REVOCADA: `${PREFIJO_EVENTO}.terminal.plantilla.revocada`,
  PLANTILLA_PURGADA: `${PREFIJO_EVENTO}.biometria.plantilla.purgada`,
  TERMINAL_FUERA_LINEA: `${PREFIJO_EVENTO}.terminal.fuera_linea`,
  TERMINAL_RECUPERADO: `${PREFIJO_EVENTO}.terminal.recuperado`,
  PASO_TERMINAL: `${PREFIJO_EVENTO}.terminal.paso`,
} as const;

export type NombreEvento = (typeof Eventos)[keyof typeof Eventos];

/** Comodín para suscribirse a todos los eventos de dominio (bitácora). */
export const TODOS_LOS_EVENTOS = `${PREFIJO_EVENTO}.**`;
