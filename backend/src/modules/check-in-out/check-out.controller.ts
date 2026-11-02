import { Body, Controller, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { ServicioCheckOut } from './check-out.service.js';
import { ConfirmarCheckOutDto, EscanearCheckOutDto } from './dto/check-out.dto.js';

@ApiTags('Check-out')
@ApiCookieAuth('vms_access')
@Roles(Rol.RECEPCION_SEGURIDAD)
@Controller('check-out')
export class CheckOutController {
  constructor(private readonly checkOut: ServicioCheckOut) {}

  @Get('salidas-recientes')
  @ApiOperation({ summary: 'Salidas de hoy con terminales y estado de la revocación de la plantilla (Tabla 16)' })
  salidasRecientes() {
    return this.checkOut.salidasRecientes();
  }

  @Post('escanear')
  @HttpCode(200)
  @ApiOperation({ summary: 'Devuelve la visita activa y lo que debe devolver. 409 si no hay check-in activo (HU-13)' })
  escanear(@Body() dto: EscanearCheckOutDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.checkOut.escanear(dto, usuario);
  }

  @Post(':visitaId/devolucion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registra lo devuelto sin cerrar la visita: el visitante sale por el terminal (D5)' })
  devolucion(@Param('visitaId', ParseUUIDPipe) visitaId: string, @Body() dto: ConfirmarCheckOutDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.checkOut.registrarDevolucion(visitaId, dto, usuario, ip);
  }

  @Post(':visitaId/confirmar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registra la salida, las incidencias de devolución y revoca el paso en el ACS (HU-13, HU-14)' })
  confirmar(@Param('visitaId', ParseUUIDPipe) visitaId: string, @Body() dto: ConfirmarCheckOutDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.checkOut.confirmar(visitaId, dto, usuario, ip);
  }
}
