import { Body, Controller, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { BiometriaService } from './biometria.service.js';
import { EnrolarHuellaDto, IdentificarHuellaDto } from './dto/biometria.dto.js';

@ApiTags('Biometría')
@ApiCookieAuth('vms_access')
@Roles(Rol.RECEPCION_SEGURIDAD)
@Controller('biometria')
export class BiometriaController {
  constructor(private readonly biometria: BiometriaService) {}

  @Post('identificacion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Identificación 1:N contra las visitas del día; no cambia de estado (HU-07)' })
  identificar(@Body() dto: IdentificarHuellaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.biometria.identificar(dto, usuario, ip);
  }

  @Get('visitas/:visitaId')
  @ApiOperation({ summary: 'Estado de la huella del visitante, sin plantillas (HU-37, RNF-07)' })
  estado(@Param('visitaId', ParseUUIDPipe) visitaId: string) {
    return this.biometria.estado(visitaId);
  }

  @Post('visitas/:visitaId/enrolamiento')
  @ApiOperation({ summary: 'Enrolar dos dedos tras confirmar el documento físico (HU-06, HU-37)' })
  enrolar(@Param('visitaId', ParseUUIDPipe) visitaId: string, @Body() dto: EnrolarHuellaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.biometria.enrolar(visitaId, dto.muestras, usuario, ip);
  }
}
