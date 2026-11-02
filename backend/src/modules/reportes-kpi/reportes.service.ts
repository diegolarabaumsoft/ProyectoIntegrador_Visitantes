import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { PeriodicidadReporte, TipoEvento } from '../../generated/prisma/enums.js';
import { correoAviso } from '../../integraciones/correo/plantillas.js';
import { armarCsv } from '../bitacora/bitacora.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { ProgramacionDto, TipoReporte } from './dto/reportes-kpi.dto.js';
import { finDia, inicioDia, sumarDias } from './fechas.js';

const CARPETA = join(process.cwd(), 'storage', 'reportes');

/** Reportes en CSV (HU-22). Solo datos de operación: ninguno incluye nombre, documento ni correo de visitantes. */
@Injectable()
export class ReportesService {
  private readonly logger = new Logger(ReportesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly notificaciones: NotificacionesService,
    private readonly eventos: PublicadorEventos,
  ) {}

  listar() {
    return this.prisma.reporteGenerado.findMany({ orderBy: { generadoEn: 'desc' }, take: 100 });
  }

  async generar(tipo: TipoReporte, desde: string, hasta: string, autor: UsuarioAutenticado | null, periodicidad: PeriodicidadReporte | null = null, ip?: string) {
    if (desde > hasta) throw new BadRequestException({ codigo: 'RANGO_INVALIDO', mensaje: 'La fecha inicial no puede ser posterior a la final' });
    const csv = await this.contenido(tipo, desde, hasta);
    await mkdir(CARPETA, { recursive: true });
    const reporte = await this.prisma.reporteGenerado.create({
      data: { tipo, periodicidad, desde: new Date(`${desde}T00:00:00.000Z`), hasta: new Date(`${hasta}T00:00:00.000Z`), formato: 'csv', rutaArchivo: '', generadoPor: autor?.nombre ?? ACTOR_SISTEMA },
    });
    const nombre = `${reporte.id}.csv`;
    await writeFile(join(CARPETA, nombre), csv, 'utf8');
    const guardado = await this.prisma.reporteGenerado.update({ where: { id: reporte.id }, data: { rutaArchivo: nombre } });
    this.eventos.publicar(Eventos.REPORTE_GENERADO, {
      tipo: TipoEvento.REPORTE_GENERADO,
      actor: autor?.nombre ?? ACTOR_SISTEMA,
      actorId: autor?.id ?? null,
      entidad: 'reporte',
      entidadId: reporte.id,
      resultado: `reporte ${tipo} generado`,
      detalle: { desde, hasta, periodicidad },
      ip,
    });
    return guardado;
  }

  async archivo(id: string): Promise<{ nombre: string; contenido: Buffer }> {
    const reporte = await this.prisma.reporteGenerado.findUnique({ where: { id } });
    // rutaArchivo lo escribe solo este servicio y es <uuid>.csv
    if (!reporte?.rutaArchivo) throw new NotFoundException({ codigo: 'REPORTE_NO_ENCONTRADO', mensaje: 'El reporte no existe' });
    try {
      const contenido = await readFile(join(CARPETA, reporte.rutaArchivo));
      return { nombre: `reporte-${reporte.tipo.toLowerCase()}-${reporte.desde.toISOString().slice(0, 10)}.csv`, contenido };
    } catch {
      throw new NotFoundException({ codigo: 'ARCHIVO_NO_DISPONIBLE', mensaje: 'El archivo del reporte ya no está disponible' });
    }
  }

  async programacion() {
    const [periodicidad, destinatarios] = await Promise.all([this.configuracion.texto('reportes_periodicidad'), this.configuracion.lista('reportes_destinatarios')]);
    return { periodicidad: (periodicidad || null) as PeriodicidadReporte | null, destinatarios };
  }

  async guardarProgramacion(dto: ProgramacionDto, usuario: UsuarioAutenticado, ip?: string) {
    await this.configuracion.actualizar('reportes_periodicidad', dto.periodicidad ?? '');
    await this.configuracion.actualizar('reportes_destinatarios', dto.destinatarios);
    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, {
      tipo: TipoEvento.CONFIGURACION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'configuracion',
      entidadId: 'reportes_periodicidad',
      resultado: 'programación de reportes modificada',
      detalle: { periodicidad: dto.periodicidad ?? null, destinatarios: dto.destinatarios.length },
      ip,
    });
    return this.programacion();
  }

  /** Envía el reporte programado si `ayer` cierra su período: cada día, los domingos o el último día del mes. */
  async enviarProgramado(ayer: string): Promise<boolean> {
    const { periodicidad, destinatarios } = await this.programacion();
    if (!periodicidad || destinatarios.length === 0) return false;
    const dia = new Date(`${ayer}T12:00:00.000Z`);
    let desde: string;
    if (periodicidad === PeriodicidadReporte.DIARIA) desde = ayer;
    else if (periodicidad === PeriodicidadReporte.SEMANAL) {
      if (dia.getUTCDay() !== 0) return false;
      desde = sumarDias(ayer, -6);
    } else {
      if (sumarDias(ayer, 1).slice(8) !== '01') return false;
      desde = `${ayer.slice(0, 8)}01`;
    }
    const reporte = await this.generar('VISITAS', desde, ayer, null, periodicidad);
    const { nombre, contenido } = await this.archivo(reporte.id);
    const correo = correoAviso({
      asunto: `Reporte de visitas ${desde} a ${ayer}`,
      titulo: 'Reporte programado',
      introduccion: 'Se adjunta el reporte de visitas del período.',
      datos: [{ etiqueta: 'Período', valor: `${desde} a ${ayer}` }],
    });
    await Promise.all(destinatarios.map((destinatario) => this.notificaciones.enviarCorreo({ destinatario, ...correo, tipo: 'REPORTE_PROGRAMADO', adjuntos: [{ nombre, contenido, tipo: 'text/csv' }] })));
    this.logger.log(`Reporte programado enviado a ${destinatarios.length} destinatario(s)`);
    return true;
  }

  private async contenido(tipo: TipoReporte, desde: string, hasta: string): Promise<string> {
    const rango = { gte: inicioDia(desde), lte: finDia(hasta) };
    if (tipo === 'KPI') {
      const filas = await this.prisma.indicador.findMany({ where: { periodo: { gte: new Date(`${desde}T00:00:00.000Z`), lte: new Date(`${hasta}T00:00:00.000Z`) } }, orderBy: [{ periodo: 'asc' }, { nombre: 'asc' }] });
      return armarCsv(['periodo', 'indicador', 'valor'], filas.map((f) => [f.periodo.toISOString().slice(0, 10), f.nombre, String(f.valor)]));
    }
    if (tipo === 'INCIDENCIAS') {
      const filas = await this.prisma.eventoBitacora.findMany({ where: { tipoEvento: TipoEvento.INCIDENCIA_DEVOLUCION, fechaHora: rango }, orderBy: { fechaHora: 'asc' } });
      return armarCsv(['fechaHora', 'visitaId', 'operador', 'resultado'], filas.map((f) => [f.fechaHora.toISOString(), f.visitaId, f.actor, f.resultado]));
    }
    const filas = await this.prisma.visita.findMany({ where: { fechaProgramada: rango }, include: { visitante: { select: { empresa: true } }, anfitrion: { select: { nombre: true } } }, orderBy: { fechaProgramada: 'asc' } });
    return armarCsv(
      ['visitaId', 'fechaProgramada', 'empresa', 'anfitrion', 'estado', 'horaIngreso', 'horaSalida', 'expres', 'contingencia'],
      filas.map((v) => [v.id, v.fechaProgramada.toISOString(), v.visitante.empresa, v.anfitrion.nombre, v.estado, v.horaIngreso?.toISOString() ?? null, v.horaSalida?.toISOString() ?? null, v.esExpres ? 'sí' : 'no', v.modoContingencia ? 'sí' : 'no']),
    );
  }
}
