import { Body, Controller, Delete, Get, Header, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { AlertasService, NOMBRE_INDICADOR } from './alertas.service.js';
import { ActualizarAlertaDto, CrearAlertaDto, GenerarReporteDto, ProgramacionDto, RecalcularDto } from './dto/reportes-kpi.dto.js';
import { KpiService } from './kpi.service.js';
import { ReportesService } from './reportes.service.js';

@ApiTags('KPI')
@ApiCookieAuth('vms_access')
@Controller('kpi')
export class KpiController {
  constructor(
    private readonly kpi: KpiService,
    private readonly alertas: AlertasService,
  ) {}

  @Get('tablero')
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Indicadores del último día calculado y serie de 7 días (HU-21)' })
  tablero() {
    return this.kpi.tablero();
  }

  @Get('indicadores')
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Histórico de indicadores calculados' })
  indicadores() {
    return this.kpi.indicadores();
  }

  @Post('recalcular')
  @HttpCode(200)
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Recalcula los indicadores de un día' })
  async recalcular(@Query() dto: RecalcularDto) {
    return { fecha: dto.fecha, valores: Object.fromEntries(await this.kpi.calcularDia(dto.fecha)) };
  }
}

@ApiTags('Reportes')
@ApiCookieAuth('vms_access')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Reportes generados (HU-22)' })
  listar() {
    return this.reportes.listar();
  }

  @Post('generar')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Genera un reporte CSV bajo demanda' })
  generar(@Body() dto: GenerarReporteDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.reportes.generar(dto.tipo, dto.desde, dto.hasta, usuario, null, ip);
  }

  @Get('programacion')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Periodicidad y destinatarios del reporte programado' })
  programacion() {
    return this.reportes.programacion();
  }

  @Put('programacion')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Guarda periodicidad y destinatarios' })
  guardar(@Body() dto: ProgramacionDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.reportes.guardarProgramacion(dto, usuario, ip);
  }

  @Get(':id/descargar')
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Descarga el archivo de un reporte' })
  async descargar(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) respuesta: Response) {
    const { nombre, contenido } = await this.reportes.archivo(id);
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    return new StreamableFile(contenido);
  }
}

@ApiTags('Alertas por umbral')
@ApiCookieAuth('vms_access')
@Roles(Rol.ADMINISTRADOR)
@Controller('alertas-umbral')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  @ApiOperation({ summary: 'Alertas configuradas (HU-24)' })
  listar() {
    return this.alertas.listar();
  }

  @Get('indicadores')
  @ApiOperation({ summary: 'Nombres legibles de los indicadores' })
  indicadores() {
    return NOMBRE_INDICADOR;
  }

  @Post()
  @ApiOperation({ summary: 'Crea una alerta' })
  crear(@Body() dto: CrearAlertaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.alertas.crear(dto, usuario, ip);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica una alerta' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarAlertaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.alertas.actualizar(id, dto, usuario, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina una alerta' })
  eliminar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.alertas.eliminar(id, usuario, ip);
  }
}
