import { Module } from '@nestjs/common';
import { BiometriaController } from './biometria.controller.js';
import { BiometriaService } from './biometria.service.js';
import { MOTOR_COTEJO, MotorSimulado } from './motor-cotejo.js';

@Module({
  controllers: [BiometriaController],
  providers: [BiometriaService, { provide: MOTOR_COTEJO, useClass: MotorSimulado }],
  exports: [BiometriaService],
})
export class BiometriaModule {}
