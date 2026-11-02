import { Global, Module } from '@nestjs/common';
import { CanalCorreo } from './canal-correo.service.js';
import { CANAL_NOTIFICACION } from './canal-notificacion.js';

@Global()
@Module({
  providers: [{ provide: CANAL_NOTIFICACION, useClass: CanalCorreo }],
  exports: [CANAL_NOTIFICACION],
})
export class CorreoModule {}
