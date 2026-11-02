import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service.js';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { type EventoDominio, Eventos, TODOS_LOS_EVENTOS } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { type PaginacionDto, paginar } from '../../common/dto/paginacion.dto.js';

export interface FiltroBitacora {
  tipoEvento?: TipoEvento;
  actorId?: string;
  visitaId?: string;
  desde?: Date;
  hasta?: Date;
  entidad?: string;
  entidadId?: string;
  actor?: string;
}

const MAX_FILAS_EXPORTACION = 50_000;
const COLUMNAS_CSV = ['id', 'fechaHora', 'tipoEvento', 'actor', 'visitaId', 'entidad', 'entidadId', 'resultado', 'ip'];

/** Comillas según RFC 4180 y apóstrofo inicial para que Excel no ejecute una celda como fórmula. */
function celdaCsv(valor: string | null): string {
  const texto = valor ?? '';
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replaceAll('"', '""')}"`;
}

/**
 * Bitácora inmutable (HU-15, RNF-06). Se suscribe a todos los eventos de
 * dominio y solo hace INSERT. La tabla tiene un trigger que rechaza
 * UPDATE y DELETE.
 */
/** CSV para Excel en español: separador `;`, marca BOM y celdas protegidas. */
export function armarCsv(columnas: string[], filas: (string | null)[][]): string {
  return `\uFEFF${[columnas.join(';'), ...filas.map((f) => f.map(celdaCsv).join(';'))].join('\r\n')}\r\n`;
}

@Injectable()
export class BitacoraService {
  private readonly logger = new Logger(BitacoraService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: PublicadorEventos,
  ) {}

  @OnEvent(TODOS_LOS_EVENTOS, { async: true, promisify: true })
  async registrar(evento: EventoDominio): Promise<void> {
    try {
      await this.prisma.eventoBitacora.create({
        data: {
          fechaHora: evento.fecha ?? new Date(),
          tipoEvento: evento.tipo,
          actor: evento.actor,
          actorId: evento.actorId ?? null,
          visitaId: evento.visitaId ?? null,
          entidad: evento.entidad ?? null,
          entidadId: evento.entidadId ?? null,
          resultado: evento.resultado,
          detalle: (evento.detalle ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: evento.ip ?? null,
        },
      });
    } catch (error) {
      // Nunca interrumpe la operación de negocio, pero deja rastro en el log
      this.logger.error(`No se pudo escribir en la bitácora el evento ${evento.tipo}`, error instanceof Error ? error.stack : String(error));
    }
  }

  async consultar(filtro: FiltroBitacora, paginacion: PaginacionDto) {
    const where = this.condicion(filtro);
    const [datos, total] = await Promise.all([
      this.prisma.eventoBitacora.findMany({
        where,
        orderBy: { fechaHora: 'desc' },
        skip: paginacion.skip,
        take: paginacion.limite,
      }),
      this.prisma.eventoBitacora.count({ where }),
    ]);
    return paginar(
      datos.map((e) => ({ ...e, id: e.id.toString() })),
      total,
      paginacion,
    );
  }

  /** CSV para auditoría con `;` como separador (Excel en español). El `detalle` no se exporta. */
  async exportar(filtro: FiltroBitacora, usuario: UsuarioAutenticado, ip?: string): Promise<{ csv: string; truncado: boolean }> {
    const eventos = await this.prisma.eventoBitacora.findMany({
      where: this.condicion(filtro),
      orderBy: { fechaHora: 'desc' },
      take: MAX_FILAS_EXPORTACION,
    });
    const filas = eventos.map((e) => [e.id.toString(), e.fechaHora.toISOString(), e.tipoEvento, e.actor, e.visitaId, e.entidad, e.entidadId, e.resultado, e.ip]);
    this.eventos.publicar(Eventos.REPORTE_GENERADO, {
      tipo: TipoEvento.REPORTE_GENERADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'bitacora',
      resultado: `bitácora exportada: ${eventos.length} filas`,
      detalle: { filas: eventos.length, limiteAlcanzado: eventos.length === MAX_FILAS_EXPORTACION, desde: filtro.desde?.toISOString() ?? null, hasta: filtro.hasta?.toISOString() ?? null, tipoEvento: filtro.tipoEvento ?? null },
      ip,
    });
    return { csv: armarCsv(COLUMNAS_CSV, filas), truncado: eventos.length === MAX_FILAS_EXPORTACION };
  }

  /** Línea de tiempo según el rol: el anfitrión solo ve sus visitas y sin IP ni detalle técnico. */
  async porVisitaPara(visitaId: string, usuario: UsuarioAutenticado) {
    if (usuario.rol !== Rol.ANFITRION) return this.porVisita(visitaId);
    const propia = await this.prisma.visita.findFirst({ where: { id: visitaId, anfitrionId: usuario.id }, select: { id: true } });
    if (!propia) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    return (await this.porVisita(visitaId)).map((e) => ({ ...e, ip: null, detalle: null }));
  }

  async porVisita(visitaId: string) {
    const eventos = await this.prisma.eventoBitacora.findMany({
      where: { visitaId },
      orderBy: { fechaHora: 'asc' },
    });
    return eventos.map((e) => ({ ...e, id: e.id.toString() }));
  }

  private condicion(filtro: FiltroBitacora): Prisma.EventoBitacoraWhereInput {
    return {
      ...(filtro.tipoEvento ? { tipoEvento: filtro.tipoEvento } : {}),
      ...(filtro.actorId ? { actorId: filtro.actorId } : {}),
      ...(filtro.actor ? { actor: { contains: filtro.actor, mode: 'insensitive' } } : {}),
      ...(filtro.visitaId ? { visitaId: filtro.visitaId } : {}),
      ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
      ...(filtro.entidadId ? { entidadId: filtro.entidadId } : {}),
      ...(filtro.desde || filtro.hasta
        ? { fechaHora: { ...(filtro.desde ? { gte: filtro.desde } : {}), ...(filtro.hasta ? { lte: filtro.hasta } : {}) } }
        : {}),
    };
  }
}
