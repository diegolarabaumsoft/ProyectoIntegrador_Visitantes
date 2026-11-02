import { Module } from '@nestjs/common';
import { CredencialesModule } from '../credenciales/credenciales.module.js';
import { SeguridadIndustrialModule } from '../seguridad-industrial/seguridad-industrial.module.js';
import { PreRegistroController } from './pre-registro.controller.js';
import { PreRegistroService } from './pre-registro.service.js';

@Module({
  imports: [CredencialesModule, SeguridadIndustrialModule],
  controllers: [PreRegistroController],
  providers: [PreRegistroService],
})
export class PreRegistroModule {}
