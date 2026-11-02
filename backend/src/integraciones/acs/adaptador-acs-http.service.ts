import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import type { IControlAccesoFisico, ResultadoAcs, SolicitudAcs } from './control-acceso-fisico.js';

/**
 * Adaptador HTTP hacia el control de acceso físico real (torniquete o lector).
 * Contrato asumido del ACS: `POST {ACS_URL}/autorizaciones` con JSON
 * `{ visitaId, accion, referencia, emitidoEn }` y respuesta 2xx (opcionalmente
 * `{ referencia }`). Cualquier otra respuesta o la falta de ella dentro del
 * tiempo límite se trata como fallo y activa el modo de contingencia (RNF-04).
 */
@Injectable()
export class AdaptadorAcsHttp implements IControlAccesoFisico {
  private readonly logger = new Logger(AdaptadorAcsHttp.name);
  private readonly url: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get('ACS_URL', { infer: true }).replace(/\/$/, '');
  }

  async enviar(solicitud: SolicitudAcs, timeoutMs: number): Promise<ResultadoAcs> {
    try {
      const respuesta = await fetch(`${this.url}/autorizaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...solicitud, emitidoEn: solicitud.emitidoEn.toISOString() }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!respuesta.ok) {
        return { ok: false, timeout: false, error: `ACS respondió HTTP ${respuesta.status}` };
      }
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { referencia?: string };
      return { ok: true, referenciaAcs: cuerpo.referencia };
    } catch (error) {
      const nombre = (error as { name?: string }).name;
      const esTimeout = nombre === 'TimeoutError' || nombre === 'AbortError';
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(`ACS sin respuesta (${esTimeout ? 'tiempo límite' : mensaje}) para la visita ${solicitud.visitaId}`);
      return { ok: false, timeout: esTimeout, error: esTimeout ? `Sin respuesta en ${timeoutMs} ms` : mensaje };
    }
  }

  descripcion() {
    return { modo: 'http' as const, destino: this.url };
  }
}
