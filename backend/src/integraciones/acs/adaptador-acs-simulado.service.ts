import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import type { ComportamientoSimulado, IControlAccesoFisico, ResultadoAcs, SolicitudAcs } from './control-acceso-fisico.js';

/**
 * ACS simulado para desarrollo, demostraciones y pruebas. Su comportamiento
 * (`ok`, `timeout`, `error`) sale de ACS_SIMULADO_COMPORTAMIENTO y puede
 * cambiarse en caliente desde el panel (PATCH /integraciones/acs/simulado).
 */
@Injectable()
export class AdaptadorAcsSimulado implements IControlAccesoFisico {
  private comportamiento: ComportamientoSimulado;
  private readonly historial: SolicitudAcs[] = [];

  constructor(config: ConfigService<Env, true>) {
    this.comportamiento = config.get('ACS_SIMULADO_COMPORTAMIENTO', { infer: true });
  }

  configurar(comportamiento: ComportamientoSimulado): void {
    this.comportamiento = comportamiento;
  }

  /** Últimas solicitudes recibidas (útil en pruebas y en el panel de estado). */
  ultimasSolicitudes(cantidad = 10): SolicitudAcs[] {
    return this.historial.slice(-cantidad);
  }

  async enviar(solicitud: SolicitudAcs, timeoutMs: number): Promise<ResultadoAcs> {
    this.historial.push(solicitud);
    if (this.historial.length > 100) this.historial.shift();

    switch (this.comportamiento) {
      case 'ok':
        await esperar(30);
        return { ok: true, referenciaAcs: `SIM-${solicitud.visitaId.slice(0, 8)}` };
      case 'timeout':
        // Simula un torniquete que no contesta: se agota el tiempo límite
        await esperar(Math.min(timeoutMs, 10_000));
        return { ok: false, timeout: true, error: `Sin respuesta en ${timeoutMs} ms (simulado)` };
      case 'error':
        await esperar(30);
        return { ok: false, timeout: false, error: 'El ACS rechazó la solicitud (simulado)' };
    }
  }

  descripcion() {
    return { modo: 'simulado' as const, comportamiento: this.comportamiento };
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
