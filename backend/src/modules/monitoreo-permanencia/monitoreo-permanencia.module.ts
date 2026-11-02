import { Module } from '@nestjs/common';
import { MonitoreoPermanenciaController } from './monitoreo-permanencia.controller.js';
import { MonitoreoPermanenciaService } from './monitoreo-permanencia.service.js';

/**
 * Tarea programada de permanencia excedida (CL-04). Es un módulo aparte del
 * módulo `permanencia` de lectura (ANT-05) para que ambos avancen sin conflictos.
 */
@Module({
  controllers: [MonitoreoPermanenciaController],
  providers: [MonitoreoPermanenciaService],
  exports: [MonitoreoPermanenciaService],
})
export class MonitoreoPermanenciaModule {}
