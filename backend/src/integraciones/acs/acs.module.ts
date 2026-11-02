import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { AcsController } from './acs.controller.js';
import { AcsService } from './acs.service.js';
import { AdaptadorAcsHttp } from './adaptador-acs-http.service.js';
import { AdaptadorAcsSimulado } from './adaptador-acs-simulado.service.js';
import { CONTROL_ACCESO_FISICO } from './control-acceso-fisico.js';

/**
 * Capa de integración con el control de acceso físico. El adaptador concreto
 * se elige por ACS_MODE; los módulos de negocio solo conocen `AcsService`.
 */
@Global()
@Module({
  controllers: [AcsController],
  providers: [
    AdaptadorAcsHttp,
    AdaptadorAcsSimulado,
    {
      provide: CONTROL_ACCESO_FISICO,
      inject: [ConfigService, AdaptadorAcsHttp, AdaptadorAcsSimulado],
      useFactory: (config: ConfigService<Env, true>, http: AdaptadorAcsHttp, simulado: AdaptadorAcsSimulado) =>
        config.get('ACS_MODE', { infer: true }) === 'http' ? http : simulado,
    },
    AcsService,
  ],
  exports: [AcsService, CONTROL_ACCESO_FISICO],
})
export class AcsModule {}
