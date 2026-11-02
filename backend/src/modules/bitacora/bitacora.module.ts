import { Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller.js';
import { BitacoraService } from './bitacora.service.js';

@Module({
  controllers: [BitacoraController],
  providers: [BitacoraService],
  exports: [BitacoraService],
})
export class BitacoraModule {}
