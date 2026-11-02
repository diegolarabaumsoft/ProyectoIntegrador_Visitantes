/**
 * Interfaz ICanalNotificacion (sección 7.5 del plan, patrón Estrategia).
 * Un nuevo canal (SMS, mensajería) es una nueva clase que la implementa.
 */
export interface AdjuntoCorreo {
  nombre: string;
  contenido: Buffer;
  tipo: string;
  /** Content-ID para incrustar imágenes en el HTML (cid:...) */
  cid?: string;
}

export interface Mensaje {
  destinatario: string;
  asunto: string;
  html: string;
  texto?: string;
  adjuntos?: AdjuntoCorreo[];
}

export interface CanalNotificacion {
  enviar(mensaje: Mensaje): Promise<void>;
}

export const CANAL_NOTIFICACION = Symbol('CANAL_NOTIFICACION');
