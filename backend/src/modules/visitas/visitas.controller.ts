import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { ListarVisitasDto } from './dto/listar-visitas.dto.js';
import { VisitasService } from './visitas.service.js';

@ApiTags('Visitas')
@ApiCookieAuth('vms_access')
@Roles(Rol.ANFITRION, Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD, Rol.ADMINISTRADOR, Rol.DPO)
@Controller('visitas')
export class VisitasController {
  constructor(private readonly visitas: VisitasService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico con filtros; el anfitrión solo ve sus visitas (HU-27)' })
  listar(@Query() dto: ListarVisitasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.visitas.listar(dto, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle: visitante, credencial, consentimiento, EPP, movimientos y bitácora' })
  detalle(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.visitas.detalle(id, usuario);
  }
}
