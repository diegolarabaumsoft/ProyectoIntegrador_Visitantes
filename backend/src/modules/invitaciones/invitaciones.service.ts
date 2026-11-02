import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { type PaginacionDto, paginar } from '../../common/dto/paginacion.dto.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import type { EventoInvitacionCambiada, EventoInvitacionCreada } from '../../eventos/payloads.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma, Visita, Visitante } from '../../generated/prisma/client.js';
import { EstadoInvitacion, EstadoVisita, Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { TerminalesService } from '../terminales/terminales.service.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';
import type { CrearInvitacionDto } from './dto/crear-invitacion.dto.js';
import type { ListarInvitacionesDto } from './dto/listar-invitaciones.dto.js';

/** Fila de "Mis visitas" (A1 del prototipo): una por visitante. */
export interface FilaVisita {
  id: string;
  invitacionId: string | null;
  estado: EstadoVisita;
  fechaProgramada: Date;
  motivo: string;
  tiempoAutorizadoMin: number;
  esGrupal: boolean;
  vencimientoEnlace: Date | null;
  visitante: { id: string; nombreCompleto: string; empresa: string; correo: string };
  anfitrion: { id: string; nombre: string };
  credencialEmitida: boolean;
  preRegistroCompleto: boolean;
}

type VisitaConRelaciones = Visita & {
  visitante: Visitante;
  anfitrion: { id: string; nombre: string };
  invitacion: { esGrupal: boolean } | null;
  credencial: { activa: boolean } | null;
  consentimiento: { id: string } | null;
};

const INCLUIR = {
  visitante: true,
  anfitrion: { select: { id: true, nombre: true } },
  invitacion: { select: { esGrupal: true } },
  credencial: { select: { activa: true } },
  consentimiento: { select: { id: true } },
} satisfies Prisma.VisitaInclude;

/**
 * Invitaciones y enlaces de pre-registro (HU-01, HU-02, HU-29, HU-33).
 * Cada visitante recibe su propio enlace; una invitación agrupa varias visitas.
 */
@Injectable()
export class InvitacionesService {
  private readonly frontendUrl: string;
  private readonly enlaceHoras: number;
  private readonly permanenciaDefault: number;

  constructor(
    private readonly terminales: TerminalesService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly visitantes: VisitantesService,
    private readonly eventos: PublicadorEventos,
    config: ConfigService<Env, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true }).replace(/\/$/, '');
    this.enlaceHoras = config.get('ENLACE_PREREGISTRO_HORAS', { infer: true });
    this.permanenciaDefault = config.get('PERMANENCIA_DEFAULT_MIN', { infer: true });
  }

  async crear(dto: CrearInvitacionDto, anfitrion: UsuarioAutenticado, ip?: string) {
    if (dto.fechaVisita.getTime() < Date.now() - 60 * 60_000) {
      throw new BadRequestException({ codigo: 'FECHA_PASADA', mensaje: 'La fecha de la visita ya pasó' });
    }
    const correos = new Set(dto.visitantes.map((v) => v.correo));
    if (correos.size !== dto.visitantes.length) {
      throw new BadRequestException({ codigo: 'CORREOS_DUPLICADOS', mensaje: 'Hay visitantes con el mismo correo' });
    }

    const invitacion = await this.prisma.invitacion.create({
      data: {
        anfitrionId: anfitrion.id,
        fechaVisita: dto.fechaVisita,
        motivo: dto.motivo.trim(),
        esGrupal: dto.visitantes.length > 1,
      },
    });

    const visitas: FilaVisita[] = [];
    for (const datos of dto.visitantes) {
      const visitante = await this.visitantes.crearOActualizar(datos);
      const { token, hash, vencimiento } = this.generarEnlace(dto.fechaVisita);
      const visita = await this.prisma.visita.create({
        data: {
          invitacionId: invitacion.id,
          visitanteId: visitante.id,
          anfitrionId: anfitrion.id,
          fechaProgramada: dto.fechaVisita,
          motivo: dto.motivo.trim(),
          tiempoAutorizadoMin: dto.tiempoAutorizadoMin ?? this.permanenciaDefault,
          tokenEnlaceHash: hash,
          vencimientoEnlace: vencimiento,
        },
        include: INCLUIR,
      });
      visitas.push(this.aFila(visita));
      this.publicarInvitacionCreada(visita, token, anfitrion, ip, TipoEvento.INVITACION_CREADA);
    }

    return { invitacionId: invitacion.id, esGrupal: invitacion.esGrupal, visitas };
  }

  async listar(dto: ListarInvitacionesDto, usuario: UsuarioAutenticado) {
    const where: Prisma.VisitaWhereInput = {
      ...(usuario.rol === Rol.ANFITRION ? { anfitrionId: usuario.id } : {}),
      ...(dto.estado ? { estado: dto.estado } : {}),
      ...(dto.desde || dto.hasta
        ? { fechaProgramada: { ...(dto.desde ? { gte: dto.desde } : {}), ...(dto.hasta ? { lte: dto.hasta } : {}) } }
        : {}),
      ...(dto.q
        ? {
            OR: [
              { visitante: { empresa: { contains: dto.q, mode: 'insensitive' } } },
              { motivo: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [visitas, total, conteos] = await Promise.all([
      this.prisma.visita.findMany({ where, include: INCLUIR, orderBy: { fechaProgramada: 'desc' }, skip: dto.skip, take: dto.limite }),
      this.prisma.visita.count({ where }),
      this.prisma.visita.groupBy({
        by: ['estado'],
        where: usuario.rol === Rol.ANFITRION ? { anfitrionId: usuario.id } : {},
        _count: { _all: true },
      }),
    ]);
    const porEstado = Object.fromEntries(conteos.map((c) => [c.estado, c._count._all])) as Partial<Record<EstadoVisita, number>>;
    return { ...paginar(visitas.map((v) => this.aFila(v)), total, dto as PaginacionDto), porEstado };
  }

  async detalle(invitacionId: string, usuario: UsuarioAutenticado) {
    const invitacion = await this.prisma.invitacion.findUnique({
      where: { id: invitacionId },
      include: { visitas: { include: INCLUIR, orderBy: { createdAt: 'asc' } }, anfitrion: { select: { id: true, nombre: true, area: true } } },
    });
    if (!invitacion) throw new NotFoundException({ codigo: 'INVITACION_NO_ENCONTRADA', mensaje: 'La invitación no existe' });
    this.verificarPropiedad(invitacion.anfitrionId, usuario);
    return {
      id: invitacion.id,
      estado: invitacion.estado,
      fechaVisita: invitacion.fechaVisita,
      motivo: invitacion.motivo,
      esGrupal: invitacion.esGrupal,
      anfitrion: invitacion.anfitrion,
      createdAt: invitacion.createdAt,
      visitas: invitacion.visitas.map((v) => this.aFila(v)),
    };
  }

  async reprogramar(invitacionId: string, nuevaFecha: Date, usuario: UsuarioAutenticado, ip?: string) {
    if (nuevaFecha.getTime() < Date.now()) {
      throw new BadRequestException({ codigo: 'FECHA_PASADA', mensaje: 'La nueva fecha ya pasó' });
    }
    const invitacion = await this.obtenerEditable(invitacionId, usuario);
    await this.prisma.invitacion.update({
      where: { id: invitacion.id },
      data: { fechaVisita: nuevaFecha, estado: EstadoInvitacion.REPROGRAMADA },
    });
    for (const visita of invitacion.visitas) {
      if (visita.estado === EstadoVisita.FINALIZADA || visita.estado === EstadoVisita.CANCELADA) continue;
      const { token, hash, vencimiento } = this.generarEnlace(nuevaFecha);
      // La credencial anterior queda invalidada (HU-33); el pre-registro se conserva
      await this.prisma.credencialQr.updateMany({
        where: { visitaId: visita.id, activa: true },
        data: { activa: false, invalidadaEn: new Date(), motivoInvalidacion: 'Visita reprogramada' },
      });
      await this.terminales.revocarVisita(visita.id, usuario);
      const actualizada = await this.prisma.visita.update({
        where: { id: visita.id },
        data: {
          fechaProgramada: nuevaFecha,
          tokenEnlaceHash: hash,
          vencimientoEnlace: vencimiento,
          estado: visita.estado === EstadoVisita.PRE_REGISTRADA ? EstadoVisita.PROGRAMADA : visita.estado,
        },
        include: INCLUIR,
      });
      const publico = this.visitantes.resumen(actualizada.visitante);
      const evento: EventoInvitacionCambiada = {
        tipo: TipoEvento.INVITACION_REPROGRAMADA,
        actor: usuario.nombre,
        actorId: usuario.id,
        visitaId: visita.id,
        entidad: 'invitacion',
        entidadId: invitacion.id,
        resultado: `reprogramada para ${nuevaFecha.toISOString()}`,
        ip,
        destinatario: publico.correo,
        nombreVisitante: publico.nombreCompleto,
        nombreAnfitrion: actualizada.anfitrion.nombre,
        fechaVisita: nuevaFecha,
        cambio: 'REPROGRAMADA',
        enlace: this.enlace(token),
      };
      this.eventos.publicar(Eventos.INVITACION_REPROGRAMADA, evento);
    }
    return this.detalle(invitacion.id, usuario);
  }

  async cancelar(invitacionId: string, usuario: UsuarioAutenticado, ip?: string) {
    const invitacion = await this.obtenerEditable(invitacionId, usuario);
    await this.prisma.invitacion.update({ where: { id: invitacion.id }, data: { estado: EstadoInvitacion.CANCELADA } });
    for (const visita of invitacion.visitas) {
      if (visita.estado === EstadoVisita.FINALIZADA || visita.estado === EstadoVisita.CANCELADA) continue;
      await this.prisma.credencialQr.updateMany({
        where: { visitaId: visita.id, activa: true },
        data: { activa: false, invalidadaEn: new Date(), motivoInvalidacion: 'Invitación cancelada' },
      });
      await this.terminales.revocarVisita(visita.id, usuario);
      const actualizada = await this.prisma.visita.update({
        where: { id: visita.id },
        data: { estado: EstadoVisita.CANCELADA, tokenEnlaceHash: null, vencimientoEnlace: null },
        include: INCLUIR,
      });
      const publico = this.visitantes.resumen(actualizada.visitante);
      const evento: EventoInvitacionCambiada = {
        tipo: TipoEvento.INVITACION_CANCELADA,
        actor: usuario.nombre,
        actorId: usuario.id,
        visitaId: visita.id,
        entidad: 'invitacion',
        entidadId: invitacion.id,
        resultado: 'cancelada',
        ip,
        destinatario: publico.correo,
        nombreVisitante: publico.nombreCompleto,
        nombreAnfitrion: actualizada.anfitrion.nombre,
        fechaVisita: actualizada.fechaProgramada,
        cambio: 'CANCELADA',
      };
      this.eventos.publicar(Eventos.INVITACION_CANCELADA, evento);
    }
    return this.detalle(invitacion.id, usuario);
  }

  /** Regenera el token de una visita y reenvía el correo (HU-02). */
  async reenviarEnlace(visitaId: string, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId }, include: INCLUIR });
    if (!visita) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'La visita no existe' });
    this.verificarPropiedad(visita.anfitrionId, usuario);
    if (visita.estado !== EstadoVisita.PROGRAMADA && visita.estado !== EstadoVisita.PRE_REGISTRADA) {
      throw new BadRequestException({ codigo: 'ESTADO_INVALIDO', mensaje: 'Solo se puede reenviar el enlace de visitas programadas o pre-registradas' });
    }
    const { token, hash, vencimiento } = this.generarEnlace(visita.fechaProgramada);
    const actualizada = await this.prisma.visita.update({
      where: { id: visita.id },
      data: { tokenEnlaceHash: hash, vencimientoEnlace: vencimiento },
      include: INCLUIR,
    });
    this.publicarInvitacionCreada(actualizada, token, usuario, ip, TipoEvento.ENLACE_ENVIADO);
    return this.aFila(actualizada);
  }

  // ---------------------------------------------------------------

  private publicarInvitacionCreada(visita: VisitaConRelaciones, token: string, actor: UsuarioAutenticado, ip: string | undefined, tipo: TipoEvento) {
    const publico = this.visitantes.resumen(visita.visitante);
    const evento: EventoInvitacionCreada = {
      tipo,
      actor: actor.nombre,
      actorId: actor.id,
      visitaId: visita.id,
      entidad: 'invitacion',
      entidadId: visita.invitacionId ?? undefined,
      resultado: tipo === TipoEvento.ENLACE_ENVIADO ? 'enlace reenviado' : 'invitación creada y enlace enviado',
      detalle: { empresa: publico.empresa, fechaVisita: visita.fechaProgramada.toISOString(), motivo: visita.motivo },
      ip,
      destinatario: publico.correo,
      nombreVisitante: publico.nombreCompleto,
      nombreAnfitrion: visita.anfitrion.nombre,
      fechaVisita: visita.fechaProgramada,
      motivo: visita.motivo,
      enlace: this.enlace(token),
      vencimiento: visita.vencimientoEnlace ?? new Date(),
    };
    this.eventos.publicar(Eventos.INVITACION_CREADA, evento);
  }

  private generarEnlace(fechaVisita: Date) {
    const token = this.crypto.tokenAleatorio(32);
    const minimo = Date.now() + this.enlaceHoras * 3_600_000;
    const hastaLaVisita = fechaVisita.getTime() + 60 * 60_000;
    return { token, hash: this.crypto.hashToken(token), vencimiento: new Date(Math.max(minimo, hastaLaVisita)) };
  }

  private enlace(token: string): string {
    return `${this.frontendUrl}/pre-registro/${token}`;
  }

  private async obtenerEditable(invitacionId: string, usuario: UsuarioAutenticado) {
    const invitacion = await this.prisma.invitacion.findUnique({ where: { id: invitacionId }, include: { visitas: true } });
    if (!invitacion) throw new NotFoundException({ codigo: 'INVITACION_NO_ENCONTRADA', mensaje: 'La invitación no existe' });
    this.verificarPropiedad(invitacion.anfitrionId, usuario);
    if (invitacion.estado === EstadoInvitacion.CANCELADA) {
      throw new BadRequestException({ codigo: 'INVITACION_CANCELADA', mensaje: 'La invitación ya fue cancelada' });
    }
    if (invitacion.visitas.some((v) => v.estado === EstadoVisita.EN_PLANTA)) {
      throw new BadRequestException({ codigo: 'VISITA_EN_CURSO', mensaje: 'No se puede modificar: hay un visitante en planta' });
    }
    return invitacion;
  }

  private verificarPropiedad(anfitrionId: string, usuario: UsuarioAutenticado) {
    if (usuario.rol === Rol.ANFITRION && usuario.id !== anfitrionId) {
      throw new ForbiddenException({ codigo: 'NO_ES_SU_INVITACION', mensaje: 'Solo puede gestionar sus propias invitaciones' });
    }
  }

  private aFila(v: VisitaConRelaciones): FilaVisita {
    return {
      id: v.id,
      invitacionId: v.invitacionId,
      estado: v.estado,
      fechaProgramada: v.fechaProgramada,
      motivo: v.motivo,
      tiempoAutorizadoMin: v.tiempoAutorizadoMin,
      esGrupal: v.invitacion?.esGrupal ?? false,
      vencimientoEnlace: v.vencimientoEnlace,
      visitante: this.visitantes.resumen(v.visitante),
      anfitrion: v.anfitrion,
      credencialEmitida: v.credencial?.activa ?? false,
      preRegistroCompleto: v.consentimiento !== null,
    };
  }
}
