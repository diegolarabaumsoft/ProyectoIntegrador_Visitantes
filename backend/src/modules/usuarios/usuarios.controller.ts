import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { ActualizarUsuarioDto, CrearUsuarioDto, ListarUsuariosDto } from './dto/usuarios.dto.js';
import { UsuariosService } from './usuarios.service.js';

@ApiTags('Usuarios')
@ApiCookieAuth('vms_access')
@Roles(Rol.ADMINISTRADOR)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada con filtros por rol y estado (HU-26)' })
  listar(@Query() dto: ListarUsuariosDto) {
    return this.usuarios.listar(dto);
  }

  @Get('anfitriones')
  @Roles(Rol.ANFITRION, Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD, Rol.ADMINISTRADOR, Rol.DPO)
  @ApiOperation({ summary: 'Lista corta de anfitriones activos para selectores' })
  anfitriones() {
    return this.usuarios.anfitriones();
  }

  @Post()
  @ApiOperation({ summary: 'Crea un usuario con un único rol y le envía una contraseña temporal' })
  crear(@Body() dto: CrearUsuarioDto, @UsuarioActual() actor: UsuarioAutenticado, @Ip() ip: string) {
    return this.usuarios.crear(dto, actor, ip);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un usuario' })
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.detalle(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita nombre, correo, área y rol' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarUsuarioDto, @UsuarioActual() actor: UsuarioAutenticado, @Ip() ip: string) {
    return this.usuarios.actualizar(id, dto, actor, ip);
  }

  @Patch(':id/desactivar')
  @ApiOperation({ summary: 'Desactiva la cuenta y revoca sus sesiones; conserva el histórico' })
  desactivar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() actor: UsuarioAutenticado, @Ip() ip: string) {
    return this.usuarios.desactivar(id, actor, ip);
  }

  @Patch(':id/reactivar')
  @ApiOperation({ summary: 'Reactiva la cuenta' })
  reactivar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() actor: UsuarioAutenticado, @Ip() ip: string) {
    return this.usuarios.reactivar(id, actor, ip);
  }

  @Patch(':id/desbloquear')
  @ApiOperation({ summary: 'Reinicia los intentos fallidos de inicio de sesión' })
  desbloquear(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() actor: UsuarioAutenticado, @Ip() ip: string) {
    return this.usuarios.desbloquear(id, actor, ip);
  }

  @Patch(':id/restablecer-contrasena')
  @ApiOperation({ summary: 'Envía una nueva contraseña temporal y cierra las sesiones del usuario' })
  restablecer(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() actor: UsuarioAutenticado, @Ip() ip: string) {
    return this.usuarios.restablecerContrasena(id, actor, ip);
  }
}
