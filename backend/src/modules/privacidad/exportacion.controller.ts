import { Controller, Get, Header, Ip, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { armarCsv } from '../bitacora/bitacora.service.js';
import { ExportarAnonimizadoDto } from '../reportes-kpi/dto/reportes-kpi.dto.js';

/** Exportación anonimizada (HU-23): sin nombre, documento, correo ni teléfono. */
@ApiTags('Privacidad')
@ApiCookieAuth('vms_access')
@Controller('privacidad/exportar')
export class ExportacionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: PublicadorEventos,
  ) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV anonimizado de visitas (HU-23)' })
  async exportar(@Query() dto: ExportarAnonimizadoDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string, @Res({ passthrough: true }) respuesta: Response) {
    const visitas = await this.prisma.visita.findMany({
      where: dto.desde || dto.hasta ? { fechaProgramada: { ...(dto.desde ? { gte: dto.desde } : {}), ...(dto.hasta ? { lte: dto.hasta } : {}) } } : {},
      select: {
        fechaProgramada: true,
        motivo: true,
        estado: true,
        horaIngreso: true,
        horaSalida: true,
        visitante: { select: { empresa: true, inducciones: { where: { aprobada: true }, select: { id: true }, take: 1 } } },
        anfitrion: { select: { area: true } },
        entregasEpp: { select: { entregado: true } },
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 50_000,
    });
    const filas = visitas.map((v) => [
      v.fechaProgramada.toISOString().slice(0, 10),
      v.visitante.empresa,
      v.motivo,
      v.estado,
      v.horaIngreso && v.horaSalida ? String(Math.round((v.horaSalida.getTime() - v.horaIngreso.getTime()) / 60_000)) : null,
      v.anfitrion.area,
      v.visitante.inducciones.length > 0 ? 'sí' : 'no',
      v.entregasEpp.some((e) => e.entregado) ? 'sí' : 'no',
    ]);
    this.eventos.publicar(Eventos.EXPORTACION_ANONIMIZADA, {
      tipo: TipoEvento.EXPORTACION_ANONIMIZADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'visitas',
      resultado: `exportación anonimizada: ${filas.length} filas`,
      detalle: { desde: dto.desde?.toISOString() ?? null, hasta: dto.hasta?.toISOString() ?? null, filas: filas.length },
      ip,
    });
    respuesta.setHeader('Content-Disposition', 'attachment; filename="visitas-anonimizadas.csv"');
    return armarCsv(['fecha', 'empresa', 'motivo', 'estado', 'minutosPermanencia', 'anfitrionArea', 'induccionAprobada', 'eppEntregado'], filas);
  }
}
