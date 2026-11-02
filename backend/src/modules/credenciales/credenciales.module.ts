import { Module } from '@nestjs/common';
import { CredencialesController } from './credenciales.controller.js';
import { CredencialesService } from './credenciales.service.js';

@Module({
  controllers: [CredencialesController],
  providers: [CredencialesService],
  exports: [CredencialesService],
})
export class CredencialesModule {}
