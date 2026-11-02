import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PublicadorEventos } from './publicador-eventos.service.js';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      ignoreErrors: false,
    }),
  ],
  providers: [PublicadorEventos],
  exports: [PublicadorEventos],
})
export class EventosModule {}
