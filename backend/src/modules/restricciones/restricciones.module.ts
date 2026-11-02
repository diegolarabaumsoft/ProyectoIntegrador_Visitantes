import { Module } from '@nestjs/common';
import { BitacoraModule } from '../bitacora/bitacora.module.js';
import { RestriccionesController } from './restricciones.controller.js';
import { RestriccionesService } from './restricciones.service.js';

@Module({
  imports: [BitacoraModule],
  controllers: [RestriccionesController],
  providers: [RestriccionesService],
  exports: [RestriccionesService],
})
export class RestriccionesModule {}
