import type { EventoDominio } from './eventos.js';

/**
 * Cargas útiles específicas de algunos eventos. Los campos adicionales a
 * `EventoDominio` NO se persisten en la bitácora (solo `detalle`), por lo que
 * aquí pueden viajar datos personales en claro y tokens de un solo uso.
 */

export interface EventoInvitacionCreada extends EventoDominio {
  visitaId: string;
  destinatario: string;
  nombreVisitante: string;
  nombreAnfitrion: string;
  fechaVisita: Date;
  motivo: string;
  enlace: string;
  vencimiento: Date;
}

export interface EventoInvitacionCambiada extends EventoDominio {
  visitaId: string;
  destinatario: string;
  nombreVisitante: string;
  nombreAnfitrion: string;
  fechaVisita: Date;
  cambio: 'REPROGRAMADA' | 'CANCELADA';
  enlace?: string;
}

export interface EventoCredencialEmitida extends EventoDominio {
  visitaId: string;
  destinatario: string;
  nombreVisitante: string;
  empresa: string;
  fechaVisita: Date;
  venceEn: Date;
  /** Contenido del QR (token firmado) */
  codigoQr: string;
  enlaceCredencial: string;
}

/** Lo publica la fachada de check-in (CL-01); dispara el aviso al anfitrión (HU-10). */
export interface EventoCheckInRealizado extends EventoDominio {
  visitaId: string;
  nombreVisitante: string;
  empresa: string;
  horaIngreso: Date;
  anfitrion: { id: string; nombre: string; correo: string };
  modoContingencia: boolean;
}

/** Lo publica la fachada de check-in al encontrar coincidencia en la lista (HU-18, HU-20). */
export interface EventoCheckInBloqueado extends EventoDominio {
  visitaId: string;
  nombreVisitante: string;
  empresa: string;
  motivoRestriccion: string;
  operador: string;
}

/** Lo publica la fachada al registrar una excepción autorizada (HU-19, HU-20). */
export interface EventoExcepcionRegistrada extends EventoDominio {
  visitaId: string;
  nombreVisitante: string;
  empresa: string;
  justificacion: string;
  autorizadoPor: string;
  operador: string;
}

/** Lo publica el monitoreo de permanencia (CL-04, HU-16). */
export interface EventoAlertaPermanencia extends EventoDominio {
  visitaId: string;
  nombreVisitante: string;
  empresa: string;
  nombreAnfitrion: string;
  horaIngreso: Date;
  tiempoAutorizadoMin: number;
  minutosExcedidos: number;
}

/** Lo publica el check-out; dispara la encuesta de satisfacción si hay correo (V8). */
export interface EventoCheckOutRealizado extends EventoDominio {
  visitaId: string;
  destinatario: string | null;
  nombreVisitante: string;
  enlaceEncuesta: string;
}

/** Lo publica el check-out cuando falta devolver credencial o EPP (HU-14, CL-03). */
export interface EventoIncidenciaDevolucion extends EventoDominio {
  visitaId: string;
  nombreVisitante: string;
  empresa: string;
  elementosPendientes: string[];
  operador: string;
}

/** Lo publica el sondeo de terminales; dispara el aviso a Seguridad (HU-38). */
export interface EventoTerminalFueraLinea extends EventoDominio {
  nombreTerminal: string;
  tipoTerminal: string;
  ultimaSincronizacion: Date | null;
}
