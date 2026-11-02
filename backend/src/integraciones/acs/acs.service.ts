import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma, Visita } from '../../generated/prisma/client.js';
import { TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../../modules/configuracion/configuracion.service.js';
import { AdaptadorAcsSimulado } from './adaptador-acs-simulado.service.js';
import {
  CONTROL_ACCESO_FISICO,
  type AccionAcs,
  type ComportamientoSimulado,
  type IControlAccesoFisico,
  type ResultadoAcs,
  type SolicitudAcs,
} from './control-acceso-fisico.js';

export interface ResultadoAutorizacion {
  /** true si el ACS confirmó; false si quedó en modo de contingencia */
  autorizado: boolean;
  contingencia: boolean;
  detalle: string;
  referenciaAcs?: string;
}

export interface EstadoAcs {
  modo: 'http' | 'simulado';
  destino?: string;
  comportamiento?: ComportamientoSimulado;
  timeoutMs: number;
  pendientes: number;
  ultimoExito: Date | null;
  ultimoFallo: { fecha: Date; error: string } | null;
}

const MAX_INTENTOS_REENVIO = 30;

/**
 * Integración con el control de acceso físico (HU-09, RNF-04, sección 7.4):
 *
 * 1. `autorizarPaso` envía la autorización al ACS y espera dentro del tiempo límite.
 * 2. Si confirma, se registra `ACS_AUTORIZADO`.
 * 3. Si no responde o falla, se activa la contingencia: recepción habilita el paso
 *    manualmente, el evento queda con sello de tiempo y la autorización entra en
 *    `cola_acs_pendientes`.
 * 4. Un cron reenvía las pendientes cuando el ACS se recupera y concilia.
 */
@Injectable()
export class AcsService {
  private readonly logger = new Logger(AcsService.name);
  private ultimoExito: Date | null = null;
  private ultimoFallo: { fecha: Date; error: string } | null = null;
  private reenviando = false;

  constructor(
    @Inject(CONTROL_ACCESO_FISICO) private readonly acs: IControlAccesoFisico,
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
  ) {}

  /** Autoriza el paso del visitante en el ACS. Nunca lanza: devuelve contingencia si falla. */
  async autorizarPaso(visita: Visita, actor: string, actorId?: string): Promise<ResultadoAutorizacion> {
    return this.ejecutar(visita, 'AUTORIZAR', actor, actorId);
  }

  /** Revoca el paso (check-out, cancelación). También encola si el ACS no responde. */
  async revocarPaso(visita: Visita, actor: string, actorId?: string): Promise<ResultadoAutorizacion> {
    return this.ejecutar(visita, 'REVOCAR', actor, actorId);
  }

  async estado(): Promise<EstadoAcs> {
    const [pendientes, timeoutMs] = await Promise.all([
      this.prisma.colaAcsPendiente.count({ where: { enviadoEn: null } }),
      this.configuracion.numero('acs_timeout_ms'),
    ]);
    return { ...this.acs.descripcion(), timeoutMs, pendientes, ultimoExito: this.ultimoExito, ultimoFallo: this.ultimoFallo };
  }

  async pendientes() {
    return this.prisma.colaAcsPendiente.findMany({ where: { enviadoEn: null }, orderBy: { creadoEn: 'asc' }, take: 100 });
  }

  /** Cambia el comportamiento del ACS simulado (solo en modo simulado). */
  configurarSimulado(comportamiento: ComportamientoSimulado): boolean {
    if (this.acs instanceof AdaptadorAcsSimulado) {
      this.acs.configurar(comportamiento);
      return true;
    }
    return false;
  }

  /** Reenvía las autorizaciones pendientes. Se ejecuta cada minuto y bajo demanda. */
  @Cron(CronExpression.EVERY_MINUTE)
  async reenviarPendientes(): Promise<{ reenviadas: number; fallidas: number }> {
    if (this.reenviando) return { reenviadas: 0, fallidas: 0 };
    this.reenviando = true;
    let reenviadas = 0;
    let fallidas = 0;
    try {
      const pendientes = await this.prisma.colaAcsPendiente.findMany({
        where: { enviadoEn: null, intentos: { lt: MAX_INTENTOS_REENVIO } },
        orderBy: { creadoEn: 'asc' },
        take: 50,
      });
      if (pendientes.length === 0) return { reenviadas, fallidas };
      const timeoutMs = await this.configuracion.numero('acs_timeout_ms');

      for (const pendiente of pendientes) {
        const payload = pendiente.payload as { accion: AccionAcs; referencia: string };
        const solicitud: SolicitudAcs = { visitaId: pendiente.visitaId, accion: payload.accion, referencia: payload.referencia, emitidoEn: pendiente.creadoEn };
        const resultado = await this.acs.enviar(solicitud, timeoutMs);
        if (resultado.ok) {
          reenviadas++;
          this.ultimoExito = new Date();
          await this.prisma.colaAcsPendiente.update({
            where: { id: pendiente.id },
            data: { enviadoEn: new Date(), intentos: { increment: 1 }, error: null },
          });
          this.eventos.publicar(Eventos.ACS_RECONCILIADO, {
            tipo: TipoEvento.ACS_RECONCILIADO,
            actor: ACTOR_SISTEMA,
            visitaId: pendiente.visitaId,
            entidad: 'cola_acs',
            entidadId: pendiente.id,
            resultado: `${payload.accion} reenviada al ACS tras ${pendiente.intentos + 1} intento(s)`,
            detalle: { referenciaAcs: resultado.referenciaAcs ?? null, encoladaEn: pendiente.creadoEn.toISOString() },
          });
        } else {
          fallidas++;
          this.registrarFallo(resultado);
          await this.prisma.colaAcsPendiente.update({
            where: { id: pendiente.id },
            data: { intentos: { increment: 1 }, error: (resultado.error ?? 'sin respuesta').slice(0, 300) },
          });
          // Si el ACS sigue caído no tiene sentido seguir intentando en este ciclo
          if (resultado.timeout) break;
        }
      }
      if (reenviadas > 0 || fallidas > 0) {
        this.logger.log(`Cola ACS: ${reenviadas} reenviada(s), ${fallidas} fallida(s)`);
      }
      return { reenviadas, fallidas };
    } finally {
      this.reenviando = false;
    }
  }

  // ---------------------------------------------------------------

  private async ejecutar(visita: Visita, accion: AccionAcs, actor: string, actorId?: string): Promise<ResultadoAutorizacion> {
    const timeoutMs = await this.configuracion.numero('acs_timeout_ms');
    const solicitud: SolicitudAcs = { visitaId: visita.id, accion, referencia: `VMS-${visita.id.slice(0, 8).toUpperCase()}`, emitidoEn: new Date() };
    const resultado = await this.acs.enviar(solicitud, timeoutMs);

    if (resultado.ok) {
      this.ultimoExito = new Date();
      this.eventos.publicar(Eventos.ACS_RESPONDIO, {
        tipo: TipoEvento.ACS_AUTORIZADO,
        actor,
        actorId: actorId ?? null,
        visitaId: visita.id,
        entidad: 'acs',
        resultado: accion === 'AUTORIZAR' ? 'paso autorizado por el ACS' : 'paso revocado en el ACS',
        detalle: { referenciaAcs: resultado.referenciaAcs ?? null, timeoutMs },
      });
      return { autorizado: true, contingencia: false, detalle: 'El control de acceso confirmó la operación', referenciaAcs: resultado.referenciaAcs };
    }

    this.registrarFallo(resultado);
    const pendiente = await this.prisma.colaAcsPendiente.create({
      data: {
        visitaId: visita.id,
        payload: { accion, referencia: solicitud.referencia } as Prisma.InputJsonValue,
        intentos: 1,
        error: (resultado.error ?? 'sin respuesta').slice(0, 300),
      },
    });
    this.eventos.publicar(Eventos.ACS_CONTINGENCIA, {
      tipo: TipoEvento.ACS_CONTINGENCIA,
      actor,
      actorId: actorId ?? null,
      visitaId: visita.id,
      entidad: 'cola_acs',
      entidadId: pendiente.id,
      resultado: `${accion}: ACS ${resultado.timeout ? 'sin respuesta' : 'con error'}; operación en cola de reenvío`,
      detalle: { timeout: resultado.timeout, error: resultado.error ?? null, timeoutMs, selloTiempo: solicitud.emitidoEn.toISOString() },
    });
    return {
      autorizado: false,
      contingencia: true,
      detalle: resultado.timeout
        ? `El torniquete no respondió en ${timeoutMs} ms. Habilite el paso manualmente; la autorización quedó en cola`
        : `El control de acceso devolvió un error (${resultado.error ?? 'desconocido'}). Habilite el paso manualmente; la autorización quedó en cola`,
    };
  }

  private registrarFallo(resultado: Extract<ResultadoAcs, { ok: false }>): void {
    this.ultimoFallo = { fecha: new Date(), error: resultado.error ?? (resultado.timeout ? 'tiempo límite' : 'error') };
  }
}
