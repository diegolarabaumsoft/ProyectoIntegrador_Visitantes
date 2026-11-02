import { Module } from '@nestjs/common';
import { BiometriaModule } from '../biometria/biometria.module.js';
import { TerminalesModule } from '../terminales/terminales.module.js';
import { TerminalesEventosController } from './terminales.controller.js';
import { CredencialesModule } from '../credenciales/credenciales.module.js';
import { RestriccionesModule } from '../restricciones/restricciones.module.js';
import { SeguridadIndustrialModule } from '../seguridad-industrial/seguridad-industrial.module.js';
import { CheckInController, VisitasCheckInController } from './check-in.controller.js';
import { ServicioCheckIn } from './check-in.service.js';
import { EncuestaController, EncuestaService } from './encuesta.controller.js';
import { CheckOutController } from './check-out.controller.js';
import { ServicioCheckOut } from './check-out.service.js';

/** Fachada de check-in (CL-01) y check-out (CL-03). */
@Module({
  imports: [BiometriaModule, TerminalesModule, CredencialesModule, RestriccionesModule, SeguridadIndustrialModule],
  controllers: [CheckInController, VisitasCheckInController, CheckOutController, EncuestaController, TerminalesEventosController],
  providers: [ServicioCheckIn, ServicioCheckOut, EncuestaService],
  exports: [ServicioCheckIn, ServicioCheckOut],
})
export class CheckInOutModule {}
