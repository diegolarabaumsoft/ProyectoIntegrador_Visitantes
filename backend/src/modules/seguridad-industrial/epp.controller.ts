import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Rol } from '../../generated/prisma/enums.js';
import { DevolucionEppDto } from './dto/devolucion-epp.dto.js';
import { RegistrarEppDto } from './dto/registrar-epp.dto.js';
import { EppService } from './epp.service.js';

@ApiTags('EPP')
@ApiCookieAuth('vms_access')
@Controller('visitas/:id/epp')
export class EppController {
  constructor(private readonly epp: EppService) {}

  @Get()
  @Roles(Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Estado actual del EPP de una visita' })
  estado(@Param('id', ParseUUIDPipe) id: string) {
    return this.epp.estado(id);
  }

  @Post()
  @Roles(Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({ summary: 'Registrar entrega de EPP al visitante' })
  registrarEntrega(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarEppDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.epp.registrarEntrega(id, dto.elementos, usuario, ip);
  }

  @Patch('devolucion')
  @Roles(Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({ summary: 'Registrar devolución de EPP al salir la visita' })
  registrarDevolucion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DevolucionEppDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.epp.registrarDevolucion(id, dto.devueltos, usuario, ip);
  }
}
