import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { TERMINAL_BIOMETRICO, TerminalHttp, TerminalSimulado } from './terminal-biometrico.js';
import { TerminalesController } from './terminales.controller.js';
import { TerminalesService } from './terminales.service.js';

@Module({
  controllers: [TerminalesController],
  providers: [
    {
      provide: TERMINAL_BIOMETRICO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => (config.get('ACS_MODE', { infer: true }) === 'http' ? new TerminalHttp() : new TerminalSimulado()),
    },
    TerminalesService,
  ],
  exports: [TerminalesService],
})
export class TerminalesModule {}
