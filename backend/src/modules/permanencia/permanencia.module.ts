import { TerminalesModule } from '../terminales/terminales.module.js';
import { Module } from '@nestjs/common';
import { PermanenciaController, VisitasPermanenciaController } from './permanencia.controller.js';
import { PermanenciaService } from './permanencia.service.js';

@Module({
  imports: [TerminalesModule],
  controllers: [PermanenciaController, VisitasPermanenciaController],
  providers: [PermanenciaService],
  exports: [PermanenciaService],
})
export class PermanenciaModule {}
