import { Controller, Get, Header, Ip, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { BitacoraService } from './bitacora.service.js';
import { ConsultarBitacoraDto, ExportarBitacoraDto } from './dto/consultar-bitacora.dto.js';

@ApiTags('Bitácora')
@ApiBearerAuth()
@Controller('bitacora')
export class BitacoraController {
  constructor(private readonly bitacora: BitacoraService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.DPO, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Consulta paginada de la bitácora inmutable (solo lectura)' })
  consultar(@Query() dto: ConsultarBitacoraDto) {
    const { tipoEvento, actorId, actor, visitaId, desde, hasta, entidad, entidadId } = dto;
    return this.bitacora.consultar({ tipoEvento, actorId, actor, visitaId, desde, hasta, entidad, entidadId }, dto);
  }

  @Get('exportar')
  @Roles(Rol.ADMINISTRADOR, Rol.DPO)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Descarga en CSV para auditoría, hasta 50 000 filas (HU-15)' })
  async exportar(@Query() dto: ExportarBitacoraDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string, @Res({ passthrough: true }) respuesta: Response) {
    const { tipoEvento, actor, desde, hasta } = dto;
    const { csv, truncado } = await this.bitacora.exportar({ tipoEvento, actor, desde, hasta }, usuario, ip);
    // sv-SE da el formato AAAA-MM-DD; el día es el de la planta, no el de UTC
    const fecha = (d: Date | undefined, alterno: string) => (d ? d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }) : alterno);
    respuesta.setHeader('Content-Disposition', `attachment; filename="bitacora-${fecha(desde, 'inicio')}-${fecha(hasta, 'hoy')}${truncado ? '-PARCIAL' : ''}.csv"`);
    return csv;
  }

  @Get('visita/:visitaId')
  @Roles(Rol.ADMINISTRADOR, Rol.DPO, Rol.JEFE_SEGURIDAD, Rol.RECEPCION_SEGURIDAD, Rol.ANFITRION)
  @ApiOperation({ summary: 'Línea de tiempo de eventos de una visita' })
  porVisita(@Param('visitaId', ParseUUIDPipe) visitaId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.bitacora.porVisitaPara(visitaId, usuario);
  }
}
