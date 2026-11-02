/**
 * Interfaz IMotorCotejo (sección 7.4 del documento base). El módulo depende de
 * ella: BIO-11 agrega el motor real sin modificar el flujo.
 */
export interface IMotorCotejo {
  /** Formato de plantilla que entiende este motor. */
  readonly formato: string;
  /** Puntaje desde el que dos plantillas se consideran la misma huella. */
  umbral(): number;
  comparar(a: string, b: string): number;
}

export const MOTOR_COTEJO = Symbol('MOTOR_COTEJO');

/**
 * Motor de desarrollo: no reconoce huellas. Compara los identificadores de prueba
 * que entrega el lector simulado, por lo que no sirve como evidencia de RNF-08.
 */
export class MotorSimulado implements IMotorCotejo {
  readonly formato = 'SIMULADO';

  umbral(): number {
    return 50;
  }

  comparar(a: string, b: string): number {
    return a === b ? 100 : 0;
  }
}
