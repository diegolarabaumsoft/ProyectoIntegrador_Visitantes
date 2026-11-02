import { Global, Module } from '@nestjs/common';
import { VisitantesService } from './visitantes.service.js';

@Global()
@Module({
  providers: [VisitantesService],
  exports: [VisitantesService],
})
export class VisitantesModule {}
