import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { MonitoreoPermanenciaService } from './monitoreo-permanencia.service.js';

@ApiTags('Permanencia · monitoreo')
@ApiCookieAuth('vms_access')
@Controller('permanencia/monitoreo')
export class MonitoreoPermanenciaController {
  constructor(private readonly monitoreo: MonitoreoPermanenciaService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Estado de la tarea programada de permanencia excedida' })
  estado() {
    return this.monitoreo.estado();
  }

  @Post('revisar')
  @HttpCode(200)
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Ejecuta la revisión de permanencia ahora (HU-16), sin esperar al cron' })
  revisar() {
    return this.monitoreo.revisarPermanencia();
  }
}
