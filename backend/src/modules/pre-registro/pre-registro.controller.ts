import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { ConsentimientoDto, DatosPreRegistroDto, EvaluarInduccionDto } from './dto/pre-registro.dto.js';
import { PreRegistroService } from './pre-registro.service.js';

/**
 * Endpoints públicos del portal del visitante. La autorización es el propio
 * token del enlace (aleatorio, de un solo visitante y con vencimiento).
 */
@ApiTags('Pre-registro (portal del visitante)')
@ApiParam({ name: 'token', description: 'Token del enlace recibido por correo' })
@Controller('pre-registro/:token')
@Public()
@Throttle({ global: { limit: 60, ttl: 60_000 } })
export class PreRegistroController {
  constructor(private readonly preRegistro: PreRegistroService) {}

  @Get()
  @ApiOperation({ summary: 'Estado del asistente: paso actual, datos precargados, anfitrión y fecha (V1)' })
  estado(@Param('token') token: string) {
    return this.preRegistro.estado(token);
  }

  @Put('datos')
  @ApiOperation({ summary: 'Paso 1 · datos personales mínimos (HU-03)' })
  datos(@Param('token') token: string, @Body() dto: DatosPreRegistroDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.preRegistro.guardarDatos(token, dto, { ip, userAgent });
  }

  @Post('consentimiento')
  @HttpCode(200)
  @ApiOperation({ summary: 'Paso 2 · consentimiento informado y NDA con fecha y hora (HU-04)' })
  consentimiento(@Param('token') token: string, @Body() dto: ConsentimientoDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.preRegistro.registrarConsentimiento(token, dto, { ip, userAgent });
  }

  @Get('induccion')
  @ApiOperation({ summary: 'Paso 3 · vigencia de la inducción y preguntas de la evaluación (HU-32)' })
  induccion(@Param('token') token: string) {
    return this.preRegistro.induccionParaToken(token);
  }

  @Post('induccion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Paso 3 · envía respuestas; aprueba con el puntaje mínimo configurado (HU-32)' })
  evaluar(@Param('token') token: string, @Body() dto: EvaluarInduccionDto, @Ip() ip: string) {
    return this.preRegistro.evaluarInduccion(token, dto.respuestas, { ip });
  }

  @Post('finalizar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verifica consentimiento e inducción, emite la credencial QR y la envía por correo (HU-05)' })
  finalizar(@Param('token') token: string, @Ip() ip: string) {
    return this.preRegistro.finalizar(token, { ip });
  }

  @Get('credencial')
  @ApiOperation({ summary: 'Credencial QR vigente de la visita (V6)' })
  credencial(@Param('token') token: string) {
    return this.preRegistro.credencial(token);
  }
}
