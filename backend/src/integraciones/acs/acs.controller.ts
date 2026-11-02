import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { AcsService } from './acs.service.js';
import type { ComportamientoSimulado } from './control-acceso-fisico.js';

export class ConfigurarSimuladoDto {
  @ApiProperty({ enum: ['ok', 'timeout', 'error'] })
  @IsIn(['ok', 'timeout', 'error'])
  comportamiento!: ComportamientoSimulado;
}

@ApiTags('Integraciones · ACS')
@ApiCookieAuth('vms_access')
@Controller('integraciones/acs')
export class AcsController {
  constructor(private readonly acs: AcsService) {}

  @Get('estado')
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD, Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({ summary: 'Estado de la integración con el control de acceso físico y tamaño de la cola de reenvío' })
  estado() {
    return this.acs.estado();
  }

  @Get('pendientes')
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Autorizaciones pendientes de reenviar al ACS (modo de contingencia)' })
  pendientes() {
    return this.acs.pendientes();
  }

  @Post('reenviar')
  @HttpCode(200)
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Fuerza el reenvío de la cola sin esperar al cron' })
  reenviar() {
    return this.acs.reenviarPendientes();
  }

  @Patch('simulado')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cambia el comportamiento del ACS simulado (solo en ACS_MODE=simulado), útil para demostrar la contingencia' })
  async configurarSimulado(@Body() dto: ConfigurarSimuladoDto) {
    if (!this.acs.configurarSimulado(dto.comportamiento)) {
      throw new BadRequestException({ codigo: 'ACS_NO_SIMULADO', mensaje: 'El ACS no está en modo simulado' });
    }
    return this.acs.estado();
  }
}
