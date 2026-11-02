import { Module } from '@nestjs/common';
import { BitacoraModule } from '../bitacora/bitacora.module.js';
import { VisitasController } from './visitas.controller.js';
import { VisitasService } from './visitas.service.js';

@Module({
  imports: [BitacoraModule],
  controllers: [VisitasController],
  providers: [VisitasService],
})
export class VisitasModule {}
