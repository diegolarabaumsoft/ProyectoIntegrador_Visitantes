import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { VehiculoDto } from '../check-in-out/dto/check-in.dto.js';
import { AsignarAcompananteDto, ConsultarPresentesDto, RegistrarMovimientoDto } from './dto/permanencia.dto.js';
import { PermanenciaService } from './permanencia.service.js';

@ApiTags('Permanencia')
@ApiCookieAuth('vms_access')
@Controller('permanencia')
export class PermanenciaController {
  constructor(private readonly permanencia: PermanenciaService) {}

  @Get('presentes')
  @Roles(Rol.JEFE_SEGURIDAD, Rol.RECEPCION_SEGURIDAD, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Visitantes en planta, con tiempo restante y zona actual (HU-34)' })
  presentes(@Query() dto: ConsultarPresentesDto) {
    return this.permanencia.presentes(dto.q);
  }
}

@ApiTags('Permanencia')
@ApiCookieAuth('vms_access')
@Roles(Rol.RECEPCION_SEGURIDAD)
@Controller('visitas/:id')
export class VisitasPermanenciaController {
  constructor(private readonly permanencia: PermanenciaService) {}

  @Post('movimientos')
  @ApiOperation({ summary: 'Registrar la entrada a una zona; cierra el movimiento abierto (HU-12)' })
  movimiento(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrarMovimientoDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.permanencia.registrarMovimiento(id, dto.zonaId, usuario, ip);
  }

  @Patch('movimientos/:movId/salida')
  @ApiOperation({ summary: 'Registrar la salida de una zona (HU-12)' })
  salida(@Param('id', ParseUUIDPipe) id: string, @Param('movId', ParseUUIDPipe) movId: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.permanencia.registrarSalidaZona(id, movId, usuario, ip);
  }

  @Patch('acompanante')
  @ApiOperation({ summary: 'Asignar el usuario interno responsable de la visita (HU-35)' })
  acompanante(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AsignarAcompananteDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.permanencia.asignarAcompanante(id, dto.acompananteId, usuario, ip);
  }

  @Patch('vehiculo')
  @ApiOperation({ summary: 'Registrar placa y tipo del vehículo (HU-30)' })
  vehiculo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VehiculoDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.permanencia.registrarVehiculo(id, dto, usuario, ip);
  }
}
