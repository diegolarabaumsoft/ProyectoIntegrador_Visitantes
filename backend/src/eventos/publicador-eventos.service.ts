import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type EventoDominio, type NombreEvento } from './eventos.js';

/**
 * Fachada tipada sobre EventEmitter2. Los eventos se emiten de forma
 * asíncrona para no retrasar la operación que los origina (RNF-01).
 */
@Injectable()
export class PublicadorEventos {
  private readonly logger = new Logger(PublicadorEventos.name);

  constructor(private readonly emitter: EventEmitter2) {}

  publicar(nombre: NombreEvento, evento: EventoDominio): void {
    const payload: EventoDominio = { ...evento, fecha: evento.fecha ?? new Date() };
    this.emitter.emitAsync(nombre, payload).catch((error: unknown) => {
      this.logger.error(`Error en suscriptor del evento ${nombre}`, error instanceof Error ? error.stack : String(error));
    });
  }
}
