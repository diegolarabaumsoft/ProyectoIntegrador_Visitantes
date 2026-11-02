import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { EstadoVisita, TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

export type MotivoAnonimizacion = 'RETENCION' | 'SOLICITUD_TITULAR';

export interface ResultadoAnonimizacion {
  visitanteId: string;
  visitasAfectadas: number;
  notificacionesAfectadas: number;
  plantillasEliminadas: number;
}

export interface EstadoRetencion {
  retencionDias: number;
  candidatos: number;
  plantillasVencidas: number;
  ultimaPurga: Date | null;
  ultimaEjecucion: Date | null;
  proximaEjecucion: string;
}

/** Estados en los que un visitante todavía tiene una visita en curso o por venir. */
const ESTADOS_ACTIVOS: EstadoVisita[] = [EstadoVisita.PROGRAMADA, EstadoVisita.PRE_REGISTRADA, EstadoVisita.EN_PLANTA, EstadoVisita.BLOQUEADA];

/**
 * Privacidad de datos (RNF-03, HU-36, HU-23): anonimización irreversible de un
 * visitante conservando los agregados (empresa, fechas, estados, inducción) y
 * la bitácora, que por diseño nunca contiene datos personales.
 */
@Injectable()
export class PrivacidadService {
  private readonly logger = new Logger(PrivacidadService.name);
  private ultimaEjecucion: Date | null = null;
  private ultimaPurga: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
  ) {}

  /**
   * Anonimiza de forma irreversible los datos personales del visitante:
   * nombre, documento, correo y teléfono cifrados se reemplazan por marcadores,
   * los hashes de búsqueda se vacían, se eliminan placa de vehículo y respuestas
   * de inducción, y se enmascaran los destinatarios en el historial de correos.
   * Si el visitante tiene una visita activa, se rechaza (409 lo decide el llamador).
   */
  async anonimizarVisitante(visitanteId: string, actor: UsuarioAutenticado | typeof ACTOR_SISTEMA, motivo: MotivoAnonimizacion): Promise<ResultadoAnonimizacion> {
    const visitante = await this.prisma.visitante.findUnique({ where: { id: visitanteId }, include: { visitas: { select: { id: true, estado: true } } } });
    if (!visitante) {
      throw new NotFoundException({ codigo: 'VISITANTE_NO_ENCONTRADO', mensaje: 'El visitante no existe' });
    }
    const activa = visitante.visitas.some((v) => ESTADOS_ACTIVOS.includes(v.estado));
    if (activa) {
      throw new VisitaActivaError(visitanteId);
    }
    const visitaIds = visitante.visitas.map((v) => v.id);
    const marcador = this.crypto.cifrar('');

    const [, , , notificaciones, , plantillas] = await this.prisma.$transaction([
      this.prisma.visitante.update({
        where: { id: visitanteId },
        data: {
          nombreCompleto: marcador,
          numeroDocumento: marcador,
          numeroDocumentoHash: '',
          correo: marcador,
          correoHash: '',
          telefono: null,
          anonimizado: true,
        },
      }),
      this.prisma.vehiculo.deleteMany({ where: { visitaId: { in: visitaIds } } }),
      this.prisma.induccionSeguridad.updateMany({ where: { visitanteId }, data: { respuestas: undefined } }),
      this.prisma.notificacion.updateMany({
        where: { visitaId: { in: visitaIds } },
        data: { destinatario: 'anonimizado', mensaje: '[anonimizado]' },
      }),
      this.prisma.consentimiento.updateMany({ where: { visitaId: { in: visitaIds } }, data: { ip: null, userAgent: null } }),
      this.prisma.plantillaBiometrica.deleteMany({ where: { visitanteId } }),
    ]);

    const actorNombre = actor === ACTOR_SISTEMA ? ACTOR_SISTEMA : actor.nombre;
    const actorId = actor === ACTOR_SISTEMA ? null : actor.id;
    this.eventos.publicar(Eventos.ANONIMIZACION_EJECUTADA, {
      tipo: TipoEvento.ANONIMIZACION_RETENCION,
      actor: actorNombre,
      actorId,
      entidad: 'visitante',
      entidadId: visitanteId,
      resultado: motivo === 'RETENCION' ? 'anonimizado por vencimiento del período de retención' : 'anonimizado por solicitud del titular',
      detalle: { motivo, visitas: visitaIds.length, notificaciones: notificaciones.count },
    });
    this.publicarPurga(visitanteId, plantillas.count, actorNombre, actorId, motivo);
    return { visitanteId, visitasAfectadas: visitaIds.length, notificacionesAfectadas: notificaciones.count, plantillasEliminadas: plantillas.count };
  }

  /**
   * Revoca la autorización biométrica (HU-39, D6). Conserva los demás datos: las visitas
   * abiertas siguen con la credencial alternativa. Quien está en planta debe salir primero,
   * para no dejarlo sin su medio de salida ni dejar plantillas cargadas en los terminales.
   */
  async revocarBiometria(visitanteId: string, actor: UsuarioAutenticado): Promise<{ plantillasEliminadas: number }> {
    const enPlanta = await this.prisma.visita.count({ where: { visitanteId, estado: EstadoVisita.EN_PLANTA } });
    if (enPlanta > 0) throw new VisitaActivaError(visitanteId);
    const [plantillas] = await this.prisma.$transaction([
      this.prisma.plantillaBiometrica.deleteMany({ where: { visitanteId } }),
      this.prisma.consentimiento.updateMany({
        where: { visita: { visitanteId, estado: { in: [EstadoVisita.PROGRAMADA, EstadoVisita.PRE_REGISTRADA, EstadoVisita.BLOQUEADA] } } },
        data: { autorizaBiometria: false, versionTextoBiometrico: null },
      }),
    ]);
    this.publicarPurga(visitanteId, plantillas.count, actor.nombre, actor.id, 'REVOCACION');
    return { plantillasEliminadas: plantillas.count };
  }

  /** Purga diaria (HU-39, RNF-03): plantillas a 12 meses sin visitas. La vigencia se renueva en cada ingreso con huella. */
  @Cron('30 2 * * *')
  async purgarPlantillasVencidas(ahora = new Date()): Promise<{ eliminadas: number }> {
    this.ultimaPurga = ahora;
    const vencidas = await this.prisma.plantillaBiometrica.findMany({
      where: { venceEn: { lte: ahora }, visitante: { visitas: { none: { estado: EstadoVisita.EN_PLANTA } } } },
      select: { visitanteId: true },
      distinct: ['visitanteId'],
    });
    let eliminadas = 0;
    for (const { visitanteId } of vencidas) {
      const { count } = await this.prisma.plantillaBiometrica.deleteMany({ where: { visitanteId, venceEn: { lte: ahora } } });
      eliminadas += count;
      this.publicarPurga(visitanteId, count, ACTOR_SISTEMA, null, 'VENCIMIENTO');
    }
    // Queda en la bitácora aunque no haya nada que purgar: es la constancia de que la tarea corrió
    this.eventos.publicar(Eventos.PLANTILLA_PURGADA, { tipo: TipoEvento.PLANTILLA_PURGADA, actor: ACTOR_SISTEMA, entidad: 'plantilla_biometrica', resultado: `purga diaria: ${eliminadas} plantilla(s) eliminada(s)`, detalle: { motivo: 'PURGA_DIARIA', eliminadas } });
    return { eliminadas };
  }

  private publicarPurga(visitanteId: string, cantidad: number, actor: string, actorId: string | null, motivo: string): void {
    if (cantidad === 0) return;
    this.eventos.publicar(Eventos.PLANTILLA_PURGADA, {
      tipo: TipoEvento.PLANTILLA_PURGADA,
      actor,
      actorId,
      entidad: 'visitante',
      entidadId: visitanteId,
      resultado: `${cantidad} plantilla(s) eliminada(s)`,
      detalle: { motivo, cantidad },
    });
  }

  /** Visitantes no anonimizados sin visitas activas cuya última visita venció el período de retención. */
  async candidatosRetencion(ahora = new Date()): Promise<string[]> {
    const dias = await this.configuracion.numero('retencion_dias');
    const limite = new Date(ahora.getTime() - dias * 86_400_000);
    const visitantes = await this.prisma.visitante.findMany({
      where: {
        anonimizado: false,
        visitas: { none: { estado: { in: ESTADOS_ACTIVOS } } },
        NOT: { visitas: { some: { fechaProgramada: { gt: limite } } } },
        createdAt: { lt: limite },
      },
      select: { id: true },
    });
    return visitantes.map((v) => v.id);
  }

  /** Tarea programada diaria (02:00) de retención (RNF-03). */
  @Cron('0 2 * * *')
  async ejecutarRetencion(ahora = new Date()): Promise<{ anonimizados: number; omitidos: number }> {
    this.ultimaEjecucion = ahora;
    const candidatos = await this.candidatosRetencion(ahora);
    let anonimizados = 0;
    let omitidos = 0;
    for (const id of candidatos) {
      try {
        await this.anonimizarVisitante(id, ACTOR_SISTEMA, 'RETENCION');
        anonimizados++;
      } catch (error) {
        omitidos++;
        this.logger.warn(`No se anonimizó el visitante ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (anonimizados > 0) this.logger.log(`Retención: ${anonimizados} visitante(s) anonimizado(s)`);
    return { anonimizados, omitidos };
  }

  async estadoRetencion(): Promise<EstadoRetencion> {
    const [retencionDias, candidatos, plantillasVencidas] = await Promise.all([
      this.configuracion.numero('retencion_dias'),
      this.candidatosRetencion(),
      this.prisma.plantillaBiometrica.count({ where: { venceEn: { lte: new Date() } } }),
    ]);
    return { retencionDias, candidatos: candidatos.length, plantillasVencidas, ultimaPurga: this.ultimaPurga, ultimaEjecucion: this.ultimaEjecucion, proximaEjecucion: 'todos los días a las 02:00' };
  }
}

/** El visitante tiene una visita programada o en curso; el llamador decide el código HTTP. */
export class VisitaActivaError extends Error {
  constructor(readonly visitanteId: string) {
    super('El visitante tiene una visita programada o en curso; no puede anonimizarse todavía');
    this.name = 'VisitaActivaError';
  }
}
