import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { AlertasService } from './alertas.service.js';
import { KpiService } from './kpi.service.js';
import { AlertasController, KpiController, ReportesController } from './reportes-kpi.controller.js';
import { ReportesService } from './reportes.service.js';

@Module({
  imports: [NotificacionesModule],
  controllers: [KpiController, ReportesController, AlertasController],
  providers: [KpiService, ReportesService, AlertasService],
})
export class ReportesKpiModule {}
