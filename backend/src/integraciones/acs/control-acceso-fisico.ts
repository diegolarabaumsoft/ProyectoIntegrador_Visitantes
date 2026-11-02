/**
 * Interfaz IControlAccesoFisico (sección 7.4 y 7.5 del plan, patrón Adaptador
 * e inversión de dependencias). El check-in depende de esta interfaz, no del
 * torniquete concreto; puede probarse con el adaptador simulado.
 */
export type AccionAcs = 'AUTORIZAR' | 'REVOCAR';

export interface SolicitudAcs {
  visitaId: string;
  accion: AccionAcs;
  /** Identificador legible para el operador del ACS (nombre del visitante no viaja) */
  referencia: string;
  emitidoEn: Date;
}

export type ResultadoAcs =
  | { ok: true; referenciaAcs?: string }
  | { ok: false; timeout: boolean; error?: string };

export interface IControlAccesoFisico {
  /** Envía una autorización o revocación y espera confirmación dentro del tiempo límite. */
  enviar(solicitud: SolicitudAcs, timeoutMs: number): Promise<ResultadoAcs>;
  /** Descripción del adaptador para el panel de estado. */
  descripcion(): { modo: 'http' | 'simulado'; destino?: string; comportamiento?: ComportamientoSimulado };
}

export type ComportamientoSimulado = 'ok' | 'timeout' | 'error';

export const CONTROL_ACCESO_FISICO = Symbol('CONTROL_ACCESO_FISICO');
