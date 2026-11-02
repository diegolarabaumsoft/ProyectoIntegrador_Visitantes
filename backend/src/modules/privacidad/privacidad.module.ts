import { Module } from '@nestjs/common';
import { ExportacionController } from './exportacion.controller.js';
import { PrivacidadController } from './privacidad.controller.js';
import { PrivacidadService } from './privacidad.service.js';
import { SolicitudesController } from './solicitudes.controller.js';
import { SolicitudesService } from './solicitudes.service.js';

/**
 * Privacidad de datos (RNF-03, HU-23, HU-36). Creado por CL-06; ANT-11 y
 * ANT-12 agregan sus controladores y servicios a este módulo.
 */
@Module({
  controllers: [ExportacionController, PrivacidadController, SolicitudesController],
  providers: [PrivacidadService, SolicitudesService],
  exports: [PrivacidadService],
})
export class PrivacidadModule {}
