import { Body, Controller, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { ServicioCheckIn } from './check-in.service.js';
import { BuscarVisitaDto, ConfirmarCheckInDto, EmitirCredencialAlternativaDto, EscanearDto, EvaluarInduccionDto, RegistrarExcepcionDto, RegistroExpresDto } from './dto/check-in.dto.js';

@ApiTags('Check-in')
@ApiCookieAuth('vms_access')
@Roles(Rol.RECEPCION_SEGURIDAD)
@Controller('check-in')
export class CheckInController {
  constructor(private readonly checkIn: ServicioCheckIn) {}

  @Post('escanear')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validar el QR y devolver la ficha del visitante, sin cambiar de estado (HU-06, HU-07)' })
  escanear(@Body() dto: EscanearDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.checkIn.escanear(dto.codigo, usuario);
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Búsqueda manual por documento o nombre cuando el QR no se puede leer' })
  buscar(@Query() dto: BuscarVisitaDto) {
    return this.checkIn.buscar(dto.documento, dto.nombre);
  }

  @Get('catalogos')
  @ApiOperation({ summary: 'Anfitriones, acompañantes y zonas activas para los formularios de la consola' })
  catalogos() {
    return this.checkIn.catalogos();
  }

  @Post('expres')
  @ApiOperation({ summary: 'Registro exprés de una visita no planificada (HU-11)' })
  expres(@Body() dto: RegistroExpresDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.checkIn.expres(dto, usuario, { ip, userAgent });
  }

  @Post(':visitaId/confirmar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restricción → requisitos → ACS → EN_PLANTA. Responde AUTORIZADO, CONTINGENCIA, BLOQUEADO o RECHAZADO' })
  confirmar(@Param('visitaId', ParseUUIDPipe) visitaId: string, @Body() dto: ConfirmarCheckInDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.checkIn.confirmar(visitaId, dto, usuario, ip);
  }

  @Post(':visitaId/credencial-alternativa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Emitir la credencial alternativa a quien no puede usar la huella (HU-40, RNF-12)' })
  credencialAlternativa(@Param('visitaId', ParseUUIDPipe) visitaId: string, @Body() dto: EmitirCredencialAlternativaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.checkIn.emitirCredencialAlternativa(visitaId, dto, usuario, ip);
  }

  @Post(':visitaId/contingencia')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar la habilitación manual del paso cuando el ACS no respondió (HU-09)' })
  contingencia(@Param('visitaId', ParseUUIDPipe) visitaId: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.checkIn.contingencia(visitaId, usuario, ip);
  }
}

@ApiTags('Check-in')
@ApiCookieAuth('vms_access')
@Controller('visitas/:id')
export class VisitasCheckInController {
  constructor(private readonly checkIn: ServicioCheckIn) {}

  @Get('requisitos')
  @Roles(Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Ficha del visitante con la lista de verificación (R2)' })
  requisitos(@Param('id', ParseUUIDPipe) id: string) {
    return this.checkIn.ficha(id);
  }

  @Post('excepcion')
  @Roles(Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Registrar una excepción autorizada, limitada a la visita (HU-19)' })
  excepcion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrarExcepcionDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.checkIn.registrarExcepcion(id, dto, usuario, ip);
  }

  @Get('induccion')
  @Roles(Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({ summary: 'Preguntas para realizar la inducción en la tableta de recepción' })
  induccion(@Param('id', ParseUUIDPipe) id: string) {
    return this.checkIn.induccionParaVisita(id);
  }

  @Post('induccion')
  @HttpCode(200)
  @Roles(Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({ summary: 'Evaluar la inducción realizada en recepción (HU-32)' })
  evaluarInduccion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EvaluarInduccionDto, @Ip() ip: string) {
    return this.checkIn.evaluarInduccion(id, dto.respuestas, ip);
  }
}
