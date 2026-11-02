import type { Dedo, EstadoLector, ICapturaHuella, MotivoCapturaFallida, ResultadoCaptura } from './captura-huella.js';

export type Escenario = 'NORMAL' | MotivoCapturaFallida;
export const ESCENARIOS: readonly Escenario[] = ['NORMAL', 'CALIDAD_BAJA', 'PRUEBA_VIDA_FALLIDA', 'LECTOR_DESCONECTADO'];

export interface ConfiguracionSimulador {
  /** Persona de prueba que "coloca el dedo". No corresponde a ninguna huella real. */
  identidad: string;
  dedo: Dedo;
  escenario: Escenario;
}

const CALIDAD_SIMULADA = 80;

/**
 * Lector simulado para desarrollo: no usa imágenes ni huellas. La plantilla es
 * un identificador de prueba con formato `SIMULADO` (decisión D3 de
 * docs/CORRECCIONES_HUELLERO.md), y el panel elige la identidad y el escenario.
 */
export class AdaptadorSimulado implements ICapturaHuella {
  private configuracion: ConfiguracionSimulador = { identidad: 'persona-1', dedo: 'INDICE_D', escenario: 'NORMAL' };

  leerConfiguracion(): ConfiguracionSimulador {
    return { ...this.configuracion };
  }

  configurar(cambios: Partial<ConfiguracionSimulador>): void {
    this.configuracion = { ...this.configuracion, ...cambios };
  }

  estado(): EstadoLector {
    return { modo: 'SIMULADO', conectado: this.configuracion.escenario !== 'LECTOR_DESCONECTADO' };
  }

  capturar(_proposito: string, dedo?: Dedo): Promise<ResultadoCaptura> {
    const { identidad, dedo: dedoPanel, escenario } = this.configuracion;
    if (escenario !== 'NORMAL') return Promise.resolve({ ok: false, motivo: escenario });
    return Promise.resolve({ ok: true, formato: 'SIMULADO', plantilla: `${identidad}:${dedo ?? dedoPanel}`, calidad: CALIDAD_SIMULADA, pruebaVida: true });
  }
}
