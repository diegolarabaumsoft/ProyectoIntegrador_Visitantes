/**
 * Interfaz ICapturaHuella (sección 7.4 del documento base, patrón Adaptador).
 * El servidor WebSocket depende de esta interfaz, no del lector concreto:
 * cambiar de fabricante solo exige un adaptador nuevo (RNF-11).
 */
export type PropositoCaptura = 'IDENTIFICAR' | 'ENROLAR';

export const DEDOS = ['PULGAR_D', 'INDICE_D', 'MEDIO_D', 'ANULAR_D', 'MENIQUE_D', 'PULGAR_I', 'INDICE_I', 'MEDIO_I', 'ANULAR_I', 'MENIQUE_I'] as const;
export type Dedo = (typeof DEDOS)[number];

export type MotivoCapturaFallida = 'CALIDAD_BAJA' | 'PRUEBA_VIDA_FALLIDA' | 'LECTOR_DESCONECTADO';

export type ResultadoCaptura =
  | { ok: true; formato: string; plantilla: string; calidad: number; pruebaVida: boolean }
  | { ok: false; motivo: MotivoCapturaFallida };

export interface EstadoLector {
  modo: 'SIMULADO' | 'SDK';
  conectado: boolean;
}

export interface ICapturaHuella {
  estado(): EstadoLector;
  /** Al enrolar se indica el dedo. La imagen nunca sale del adaptador: solo se entrega la plantilla (RNF-09). */
  capturar(proposito: PropositoCaptura, dedo?: Dedo): Promise<ResultadoCaptura>;
}
