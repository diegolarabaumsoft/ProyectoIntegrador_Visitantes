import { Module } from '@nestjs/common';
import { EppController } from './epp.controller.js';
import { EppService } from './epp.service.js';
import { InduccionService } from './induccion.service.js';
import { PreguntasController } from './preguntas.controller.js';

/** Inducción (HU-32) y control de EPP (HU-31). */
@Module({
  controllers: [EppController, PreguntasController],
  providers: [InduccionService, EppService],
  exports: [InduccionService, EppService],
})
export class SeguridadIndustrialModule {}
