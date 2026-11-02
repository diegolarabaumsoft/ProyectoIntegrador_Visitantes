import { Module } from '@nestjs/common';
import { TerminalesModule } from '../terminales/terminales.module.js';
import { InvitacionesController } from './invitaciones.controller.js';
import { InvitacionesService } from './invitaciones.service.js';

@Module({
  imports: [TerminalesModule],
  controllers: [InvitacionesController],
  providers: [InvitacionesService],
  exports: [InvitacionesService],
})
export class InvitacionesModule {}
