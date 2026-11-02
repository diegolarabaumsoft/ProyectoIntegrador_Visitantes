import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { EstadoSolicitudDatos, EstadoVisita, TipoEvento, TipoSolicitudDatos } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';
import { PrivacidadService, VisitaActivaError } from './privacidad.service.js';

/** Suma días hábiles, sin sábados ni domingos; los festivos no se descuentan. */
export function sumarDiasHabiles(desde: Date, dias: number): Date {
  const fecha = new Date(desde);
  let restantes = dias;
  while (restantes > 0) {
    fecha.setDate(fecha.getDate() + 1);
    if (fecha.getDay() !== 0 && fecha.getDay() !== 6) restantes--;
  }
  return fecha;
}

/** Solicitudes de los titulares (HU-36) y política de retención (RNF-03). */
@Injectable()
export class SolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visitantes: VisitantesService,
    private readonly privacidad: PrivacidadService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
  ) {}

  async listar() {
    const filas = await this.prisma.solicitudDatos.findMany({ include: { visitante: true, atendidaPor: { select: { nombre: true } } }, orderBy: { fechaRecepcion: 'desc' }, take: 200 });
    return filas.map((s) => ({
      id: s.id,
      tipo: s.tipo,
      estado: s.estado,
      fechaRecepcion: s.fechaRecepcion,
      fechaLimite: s.fechaLimite,
      fechaRespuesta: s.fechaRespuesta,
      respuesta: s.respuesta,
      titular: this.visitantes.resumen(s.visitante).nombreCompleto,
      atendidaPor: s.atendidaPor?.nombre ?? null,
    }));
  }

  async registrar(tipo: TipoSolicitudDatos, numeroDocumento: string, usuario: UsuarioAutenticado, ip?: string) {
    const visitante = await this.visitantes.buscarPorDocumento(numeroDocumento);
    if (!visitante) throw new NotFoundException({ codigo: 'TITULAR_NO_ENCONTRADO', mensaje: 'No hay un visitante con ese documento' });
    const fechaRecepcion = new Date();
    const solicitud = await this.prisma.solicitudDatos.create({ data: { visitanteId: visitante.id, tipo, fechaRecepcion, fechaLimite: sumarDiasHabiles(fechaRecepcion, 15) } });
    this.eventos.publicar(Eventos.SOLICITUD_DATOS_REGISTRADA, {
      tipo: TipoEvento.SOLICITUD_DATOS_REGISTRADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'solicitud_datos',
      entidadId: solicitud.id,
      resultado: `solicitud de ${tipo.toLowerCase()} registrada`,
      detalle: { tipo, fechaLimite: solicitud.fechaLimite.toISOString() },
      ip,
    });
    return solicitud;
  }

  async atender(id: string, respuesta: string, usuario: UsuarioAutenticado, ip?: string) {
    const solicitud = await this.prisma.solicitudDatos.findUnique({ where: { id } });
    if (!solicitud) throw new NotFoundException({ codigo: 'SOLICITUD_NO_ENCONTRADA', mensaje: 'La solicitud no existe' });
    if (solicitud.estado === EstadoSolicitudDatos.ATENDIDA) throw new ConflictException({ codigo: 'SOLICITUD_ATENDIDA', mensaje: 'La solicitud ya fue atendida' });
    let plantillasEliminadas: number | null = null;
    if (solicitud.tipo === TipoSolicitudDatos.REVOCACION_BIOMETRICA) {
      try {
        plantillasEliminadas = await this.revocarTitular(solicitud.visitanteId, usuario);
      } catch (error) {
        if (error instanceof VisitaActivaError) throw new ConflictException({ codigo: 'VISITA_ACTIVA', mensaje: 'El titular está en planta. Atienda la solicitud cuando salga' });
        throw error;
      }
    }
    if (solicitud.tipo === TipoSolicitudDatos.ELIMINACION || solicitud.tipo === TipoSolicitudDatos.ANONIMIZACION) {
      plantillasEliminadas = 0;
      try {
        // El mismo titular puede tener varios registros si fue invitado con correos distintos.
        // El de la solicitud va al final: al anonimizarlo se pierde el hash con que se hallan los demás.
        const titular = await this.prisma.visitante.findUniqueOrThrow({ where: { id: solicitud.visitanteId }, select: { numeroDocumentoHash: true, anonimizado: true } });
        const otros = titular.numeroDocumentoHash
          ? await this.prisma.visitante.findMany({ where: { numeroDocumentoHash: titular.numeroDocumentoHash, anonimizado: false, id: { not: solicitud.visitanteId } }, select: { id: true } })
          : [];
        for (const { id: otroId } of otros) plantillasEliminadas += (await this.privacidad.anonimizarVisitante(otroId, usuario, 'SOLICITUD_TITULAR')).plantillasEliminadas;
        if (!titular.anonimizado) plantillasEliminadas += (await this.privacidad.anonimizarVisitante(solicitud.visitanteId, usuario, 'SOLICITUD_TITULAR')).plantillasEliminadas;
      } catch (error) {
        if (error instanceof VisitaActivaError) throw new ConflictException({ codigo: 'VISITA_ACTIVA', mensaje: 'El titular tiene una visita en curso. Atienda la solicitud cuando termine' });
        throw error;
      }
    }
    const atendida = await this.prisma.solicitudDatos.update({ where: { id }, data: { estado: EstadoSolicitudDatos.ATENDIDA, fechaRespuesta: new Date(), atendidaPorId: usuario.id, respuesta: plantillasEliminadas === null ? respuesta : `${respuesta}\n\nConstancia: ${plantillasEliminadas} plantilla(s) biométrica(s) eliminada(s).` } });
    this.eventos.publicar(Eventos.SOLICITUD_DATOS_ATENDIDA, {
      tipo: TipoEvento.SOLICITUD_DATOS_ATENDIDA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'solicitud_datos',
      entidadId: id,
      resultado: `solicitud de ${solicitud.tipo.toLowerCase()} atendida`,
      detalle: { tipo: solicitud.tipo, plantillasEliminadas },
      ip,
    });
    return atendida;
  }

  /** El mismo titular puede tener varios registros si fue invitado con correos distintos. */
  private async revocarTitular(visitanteId: string, usuario: UsuarioAutenticado): Promise<number> {
    const titular = await this.prisma.visitante.findUniqueOrThrow({ where: { id: visitanteId }, select: { numeroDocumentoHash: true } });
    const registros = titular.numeroDocumentoHash
      ? await this.prisma.visitante.findMany({ where: { numeroDocumentoHash: titular.numeroDocumentoHash }, select: { id: true } })
      : [{ id: visitanteId }];
    const enPlanta = await this.prisma.visita.count({ where: { visitanteId: { in: registros.map((r) => r.id) }, estado: EstadoVisita.EN_PLANTA } });
    if (enPlanta > 0) throw new VisitaActivaError(visitanteId);
    let total = 0;
    for (const { id } of registros) total += (await this.privacidad.revocarBiometria(id, usuario)).plantillasEliminadas;
    return total;
  }

  /** Datos del titular para responder una consulta; cada lectura queda en la bitácora, sin los datos. */
  async datosTitular(id: string, usuario: UsuarioAutenticado, ip?: string) {
    const solicitud = await this.prisma.solicitudDatos.findUnique({ where: { id }, include: { visitante: { include: { visitas: { select: { id: true, fechaProgramada: true, estado: true, motivo: true }, orderBy: { fechaProgramada: 'desc' }, take: 50 } } } } });
    if (!solicitud) throw new NotFoundException({ codigo: 'SOLICITUD_NO_ENCONTRADA', mensaje: 'La solicitud no existe' });
    this.eventos.publicar(Eventos.SOLICITUD_DATOS_ATENDIDA, { tipo: TipoEvento.SOLICITUD_DATOS_ATENDIDA, actor: usuario.nombre, actorId: usuario.id, entidad: 'solicitud_datos', entidadId: id, resultado: 'datos del titular consultados por el DPO', ip });
    const { nombreCompleto, tipoDocumento, numeroDocumento, empresa, correo, telefono } = this.visitantes.descifrar(solicitud.visitante);
    return { nombreCompleto, tipoDocumento, numeroDocumento, empresa, correo, telefono, visitas: solicitud.visitante.visitas };
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'America/Bogota' })
  async marcarVencidas(): Promise<{ vencidas: number }> {
    const { count } = await this.prisma.solicitudDatos.updateMany({
      where: { estado: { in: [EstadoSolicitudDatos.PENDIENTE, EstadoSolicitudDatos.EN_PROCESO] }, fechaLimite: { lt: new Date() } },
      data: { estado: EstadoSolicitudDatos.VENCIDA },
    });
    return { vencidas: count };
  }

  async retencion() {
    const [retencionDias, politicaVersion, estado] = await Promise.all([this.configuracion.numero('retencion_dias'), this.configuracion.texto('politica_version'), this.privacidad.estadoRetencion()]);
    return { retencionDias, politicaVersion, estado };
  }

  async guardarRetencion(retencionDias: number, politicaVersion: string, usuario: UsuarioAutenticado, ip?: string) {
    if (!Number.isInteger(retencionDias) || retencionDias < 1) throw new UnprocessableEntityException({ codigo: 'RETENCION_INVALIDA', mensaje: 'Los días de retención deben ser un entero positivo' });
    await this.configuracion.actualizar('retencion_dias', retencionDias);
    await this.configuracion.actualizar('politica_version', politicaVersion);
    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, {
      tipo: TipoEvento.CONFIGURACION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'configuracion',
      entidadId: 'retencion_dias',
      resultado: 'política de retención modificada',
      detalle: { retencionDias, politicaVersion },
      ip,
    });
    return this.retencion();
  }
}
