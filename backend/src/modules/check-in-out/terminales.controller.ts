import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { TerminalBiometrico } from '../../generated/prisma/client.js';
import { Rol, TipoTerminal } from '../../generated/prisma/enums.js';
import { TerminalesService } from '../terminales/terminales.service.js';
import { ServicioCheckOut } from './check-out.service.js';

export class EventoPasoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  visitaId!: string;
}

export class ConfigurarTerminalSimuladoDto {
  @ApiProperty()
  @IsBoolean()
  enLinea!: boolean;
}

/**
 * Eventos de paso de los terminales (HU-12, HU-13). Vive en la fachada porque la
 * salida dispara el mismo cierre que el check-out de la consola (Figura 17).
 */
@ApiTags('Terminales')
@Controller('terminales/:id')
export class TerminalesEventosController {
  constructor(
    private readonly terminales: TerminalesService,
    private readonly checkOut: ServicioCheckOut,
  ) {}

  @Post('eventos')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Evento de paso enviado por un terminal; se autentica con su secreto' })
  async evento(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EventoPasoDto, @Headers('x-terminal-secreto') secreto?: string) {
    return this.atender(await this.terminales.autenticar(id, secreto), dto.visitaId);
  }

  @Post('simular-paso')
  @HttpCode(200)
  @ApiCookieAuth('vms_access')
  @Roles(Rol.ADMINISTRADOR, Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({ summary: 'Simula que el visitante coloca el dedo en este terminal (solo con terminales simulados)' })
  async simularPaso(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EventoPasoDto) {
    this.terminales.exigirSimulado();
    return this.atender(await this.terminales.buscarActivo(id), dto.visitaId);
  }

  @Patch('simulado')
  @ApiCookieAuth('vms_access')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Deja un terminal simulado en línea o fuera de línea' })
  async configurarSimulado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfigurarTerminalSimuladoDto) {
    this.terminales.exigirSimulado().configurar((await this.terminales.buscarActivo(id)).id, dto.enLinea);
    return { enLinea: dto.enLinea };
  }

  private atender(terminal: TerminalBiometrico, visitaId: string) {
    const hora = new Date();
    return terminal.tipo === TipoTerminal.SALIDA ? this.checkOut.salidaPorTerminal(terminal, visitaId, hora) : this.terminales.registrarPaso(terminal, visitaId, hora);
  }
}
