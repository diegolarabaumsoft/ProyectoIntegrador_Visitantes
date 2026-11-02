import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { CrearInvitacionDto } from './dto/crear-invitacion.dto.js';
import { ListarInvitacionesDto, ReprogramarInvitacionDto } from './dto/listar-invitaciones.dto.js';
import { InvitacionesService } from './invitaciones.service.js';

@ApiTags('Invitaciones')
@ApiCookieAuth('vms_access')
@Controller('invitaciones')
export class InvitacionesController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Post()
  @Roles(Rol.ANFITRION, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear invitación (individual o grupal) y enviar enlaces de pre-registro (HU-01, HU-02, HU-29)' })
  crear(@Body() dto: CrearInvitacionDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.invitaciones.crear(dto, usuario, ip);
  }

  @Get()
  @Roles(Rol.ANFITRION, Rol.ADMINISTRADOR, Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Listar visitas invitadas (el anfitrión solo ve las suyas)' })
  listar(@Query() dto: ListarInvitacionesDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.invitaciones.listar(dto, usuario);
  }

  @Get(':id')
  @Roles(Rol.ANFITRION, Rol.ADMINISTRADOR, Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Detalle de una invitación con sus visitas' })
  detalle(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.invitaciones.detalle(id, usuario);
  }

  @Patch(':id/reprogramar')
  @Roles(Rol.ANFITRION, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Reprogramar: invalida credenciales y reenvía enlaces (HU-33)' })
  reprogramar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReprogramarInvitacionDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.invitaciones.reprogramar(id, dto.fechaVisita, usuario, ip);
  }

  @Patch(':id/cancelar')
  @Roles(Rol.ANFITRION, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cancelar: pasa las visitas a CANCELADA, invalida credenciales y notifica (HU-33)' })
  cancelar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.invitaciones.cancelar(id, usuario, ip);
  }

  @Post('visitas/:visitaId/reenviar-enlace')
  @Roles(Rol.ANFITRION, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Regenerar y reenviar el enlace de pre-registro de un visitante (HU-02)' })
  reenviar(@Param('visitaId', ParseUUIDPipe) visitaId: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.invitaciones.reenviarEnlace(visitaId, usuario, ip);
  }
}
