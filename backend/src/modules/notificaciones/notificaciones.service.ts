import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import QRCode from 'qrcode';
import { paginar } from '../../common/dto/paginacion.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ListarNotificacionesDto } from './notificaciones.controller.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import type {
  EventoAlertaPermanencia,
  EventoCheckInBloqueado,
  EventoCheckInRealizado,
  EventoCheckOutRealizado,
  EventoCredencialEmitida,
  EventoExcepcionRegistrada,
  EventoIncidenciaDevolucion,
  EventoInvitacionCambiada,
  EventoInvitacionCreada,
  EventoTerminalFueraLinea,
} from '../../eventos/payloads.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { CanalNotificacion as CanalEnum, EstadoNotificacion, Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { CANAL_NOTIFICACION, type AdjuntoCorreo, type CanalNotificacion } from '../../integraciones/correo/canal-notificacion.js';
import {
  correoAviso,
  correoCambioInvitacion,
  correoCredencial,
  correoEncuesta,
  correoReenvio,
  correoEnlacePreRegistro,
  formatearFechaHoraCorreo,
} from '../../integraciones/correo/plantillas.js';

interface SolicitudCorreo {
  destinatario: string;
  asunto: string;
  html: string;
  texto?: string;
  tipo: string;
  visitaId?: string | null;
  adjuntos?: AdjuntoCorreo[];
}

/** Roles que reciben los avisos de seguridad (coincidencias, excepciones, permanencia, incidencias). */
const ROLES_SEGURIDAD: Rol[] = [Rol.JEFE_SEGURIDAD, Rol.RECEPCION_SEGURIDAD];

const TIPOS_SIN_REENVIO = ['BIENVENIDA_USUARIO', 'CREDENCIAL_QR', 'REPORTE_PROGRAMADO', 'ENCUESTA_SATISFACCION'];

/**
 * Notificaciones (HU-02, HU-10, HU-16, HU-20): se suscribe a eventos de dominio,
 * envía por el canal configurado de forma asíncrona (RNF-01) y deja
 * historial con estado en la tabla `notificaciones`.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: PublicadorEventos,
    @Inject(CANAL_NOTIFICACION) private readonly canal: CanalNotificacion,
  ) {}

  // ---------------------------------------------------------------
  // Visitante
  // ---------------------------------------------------------------

  @OnEvent(Eventos.INVITACION_CREADA, { async: true, promisify: true })
  async alCrearInvitacion(e: EventoInvitacionCreada): Promise<void> {
    const correo = correoEnlacePreRegistro({
      nombreVisitante: e.nombreVisitante,
      nombreAnfitrion: e.nombreAnfitrion,
      fechaVisita: e.fechaVisita,
      motivo: e.motivo,
      enlace: e.enlace,
      vencimiento: e.vencimiento,
    });
    await this.enviarCorreo({ destinatario: e.destinatario, ...correo, tipo: 'ENLACE_PREREGISTRO', visitaId: e.visitaId });
  }

  @OnEvent(Eventos.INVITACION_REPROGRAMADA, { async: true, promisify: true })
  @OnEvent(Eventos.INVITACION_CANCELADA, { async: true, promisify: true })
  async alCambiarInvitacion(e: EventoInvitacionCambiada): Promise<void> {
    const correo = correoCambioInvitacion({
      nombreVisitante: e.nombreVisitante,
      nombreAnfitrion: e.nombreAnfitrion,
      tipo: e.cambio,
      fechaVisita: e.fechaVisita,
      enlace: e.enlace,
    });
    await this.enviarCorreo({ destinatario: e.destinatario, ...correo, tipo: `INVITACION_${e.cambio}`, visitaId: e.visitaId });
  }

  @OnEvent(Eventos.CREDENCIAL_EMITIDA, { async: true, promisify: true })
  async alEmitirCredencial(e: EventoCredencialEmitida): Promise<void> {
    const png = await QRCode.toBuffer(e.codigoQr, { type: 'png', width: 440, margin: 2, errorCorrectionLevel: 'M' });
    const correo = correoCredencial({
      nombreVisitante: e.nombreVisitante,
      empresa: e.empresa,
      fechaVisita: e.fechaVisita,
      venceEn: e.venceEn,
      enlaceCredencial: e.enlaceCredencial,
    });
    await this.enviarCorreo({
      destinatario: e.destinatario,
      ...correo,
      tipo: 'CREDENCIAL_QR',
      visitaId: e.visitaId,
      adjuntos: [{ nombre: 'credencial-qr.png', contenido: png, tipo: 'image/png', cid: 'credencial-qr' }],
    });
  }

  @OnEvent(Eventos.CHECKOUT_REALIZADO, { async: true, promisify: true })
  async alRealizarCheckOut(e: EventoCheckOutRealizado): Promise<void> {
    if (!e.destinatario) return;
    const correo = correoEncuesta({ nombreVisitante: e.nombreVisitante, enlace: e.enlaceEncuesta });
    await this.enviarCorreo({ destinatario: e.destinatario, ...correo, tipo: 'ENCUESTA_SATISFACCION', visitaId: e.visitaId });
  }

  // ---------------------------------------------------------------
  // Anfitrión (HU-10)
  // ---------------------------------------------------------------

  @OnEvent(Eventos.CHECKIN_REALIZADO, { async: true, promisify: true })
  async alRealizarCheckIn(e: EventoCheckInRealizado): Promise<void> {
    const correo = correoAviso({
      asunto: `Su visitante ${e.nombreVisitante} ya ingresó a la planta`,
      titulo: 'Su visitante llegó',
      introduccion: `${e.nombreVisitante} (${e.empresa}) completó el check-in en recepción. Por favor acuda a recibirlo.`,
      datos: [
        { etiqueta: 'Visitante', valor: `${e.nombreVisitante} · ${e.empresa}` },
        { etiqueta: 'Hora de ingreso', valor: formatearFechaHoraCorreo(e.horaIngreso) },
        ...(e.modoContingencia ? [{ etiqueta: 'Nota', valor: 'El control de acceso operó en modo de contingencia' }] : []),
      ],
      accion: 'Recuerde que el visitante debe permanecer acompañado en las zonas que lo exigen.',
    });
    await this.enviarCorreo({ destinatario: e.anfitrion.correo, ...correo, tipo: 'AVISO_INGRESO_ANFITRION', visitaId: e.visitaId });
  }

  // ---------------------------------------------------------------
  // Seguridad y DPO (HU-16, HU-20, HU-14)
  // ---------------------------------------------------------------

  @OnEvent(Eventos.CHECKIN_BLOQUEADO, { async: true, promisify: true })
  async alBloquearCheckIn(e: EventoCheckInBloqueado): Promise<void> {
    const correo = correoAviso({
      asunto: 'Ingreso bloqueado por coincidencia en la lista de restricción',
      titulo: 'Ingreso bloqueado',
      tono: 'alerta',
      introduccion: 'Recepción intentó registrar el ingreso de una persona que figura en la lista de restricción. El check-in se bloqueó antes de contactar al control de acceso.',
      datos: [
        { etiqueta: 'Visitante', valor: `${e.nombreVisitante} · ${e.empresa}` },
        { etiqueta: 'Motivo de la restricción', valor: e.motivoRestriccion },
        { etiqueta: 'Operador', valor: e.operador },
        { etiqueta: 'Fecha y hora', valor: formatearFechaHoraCorreo(e.fecha ?? new Date()) },
      ],
      accion: 'Solo el jefe de seguridad puede autorizar una excepción documentada.',
    });
    await this.enviarARoles([...ROLES_SEGURIDAD, Rol.DPO], { ...correo, tipo: 'AVISO_CHECKIN_BLOQUEADO', visitaId: e.visitaId });
  }

  @OnEvent(Eventos.EXCEPCION_REGISTRADA, { async: true, promisify: true })
  async alRegistrarExcepcion(e: EventoExcepcionRegistrada): Promise<void> {
    const correo = correoAviso({
      asunto: 'Excepción autorizada para un visitante restringido',
      titulo: 'Excepción autorizada',
      tono: 'alerta',
      introduccion: 'Se registró una excepción que permite el ingreso de una persona en la lista de restricción, limitada a la visita en curso.',
      datos: [
        { etiqueta: 'Visitante', valor: `${e.nombreVisitante} · ${e.empresa}` },
        { etiqueta: 'Justificación', valor: e.justificacion },
        { etiqueta: 'Autorizada por', valor: e.autorizadoPor },
        { etiqueta: 'Registrada por', valor: e.operador },
        { etiqueta: 'Fecha y hora', valor: formatearFechaHoraCorreo(e.fecha ?? new Date()) },
      ],
    });
    await this.enviarARoles([...ROLES_SEGURIDAD, Rol.DPO], { ...correo, tipo: 'AVISO_EXCEPCION', visitaId: e.visitaId });
  }

  @OnEvent(Eventos.ALERTA_PERMANENCIA, { async: true, promisify: true })
  async alExcederPermanencia(e: EventoAlertaPermanencia): Promise<void> {
    const correo = correoAviso({
      asunto: `Permanencia excedida: ${e.nombreVisitante} lleva ${e.minutosExcedidos} min más de lo autorizado`,
      titulo: 'Permanencia excedida',
      tono: 'alerta',
      introduccion: 'Un visitante superó el tiempo de permanencia autorizado sin registrar su salida. Verifique su situación.',
      datos: [
        { etiqueta: 'Visitante', valor: `${e.nombreVisitante} · ${e.empresa}` },
        { etiqueta: 'Anfitrión', valor: e.nombreAnfitrion },
        { etiqueta: 'Hora de ingreso', valor: formatearFechaHoraCorreo(e.horaIngreso) },
        { etiqueta: 'Tiempo autorizado', valor: `${e.tiempoAutorizadoMin} min` },
        { etiqueta: 'Exceso', valor: `${e.minutosExcedidos} min` },
      ],
      accion: 'Consulte la lista de presentes y contacte al anfitrión.',
    });
    await this.enviarARoles(ROLES_SEGURIDAD, { ...correo, tipo: 'AVISO_PERMANENCIA_EXCEDIDA', visitaId: e.visitaId });
  }

  @OnEvent(Eventos.TERMINAL_FUERA_LINEA, { async: true, promisify: true })
  async alCaerTerminal(e: EventoTerminalFueraLinea): Promise<void> {
    const correo = correoAviso({
      asunto: `Terminal fuera de línea: ${e.nombreTerminal}`,
      titulo: 'Terminal biométrico fuera de línea',
      tono: 'alerta',
      introduccion: 'Un terminal dejó de responder. Las cargas y revocaciones quedan en cola hasta que se recupere.',
      datos: [
        { etiqueta: 'Terminal', valor: e.nombreTerminal },
        { etiqueta: 'Tipo', valor: e.tipoTerminal },
        { etiqueta: 'Última sincronización', valor: e.ultimaSincronizacion ? formatearFechaHoraCorreo(e.ultimaSincronizacion) : 'Sin registro' },
      ],
      accion: 'Verifique el equipo y la red. Mientras tanto, recepción usa el modo de contingencia.',
    });
    await this.enviarARoles(ROLES_SEGURIDAD, { ...correo, tipo: 'AVISO_TERMINAL_FUERA_LINEA' });
  }

  @OnEvent(Eventos.INCIDENCIA_DEVOLUCION, { async: true, promisify: true })
  async alRegistrarIncidencia(e: EventoIncidenciaDevolucion): Promise<void> {
    const correo = correoAviso({
      asunto: 'Incidencia en el check-out: elementos no devueltos',
      titulo: 'Elementos no devueltos',
      tono: 'alerta',
      introduccion: 'Al cerrar la visita quedaron elementos sin devolver.',
      datos: [
        { etiqueta: 'Visitante', valor: `${e.nombreVisitante} · ${e.empresa}` },
        { etiqueta: 'Pendientes', valor: e.elementosPendientes.join(', ') },
        { etiqueta: 'Operador', valor: e.operador },
      ],
    });
    await this.enviarARoles(ROLES_SEGURIDAD, { ...correo, tipo: 'AVISO_INCIDENCIA_DEVOLUCION', visitaId: e.visitaId });
  }

  // ---------------------------------------------------------------

  async listar(dto: ListarNotificacionesDto) {
    const where: Prisma.NotificacionWhereInput = {
      ...(dto.tipo ? { tipo: dto.tipo } : {}),
      ...(dto.estado ? { estado: dto.estado } : {}),
      ...(dto.visitaId ? { visitaId: dto.visitaId } : {}),
      ...(dto.desde || dto.hasta ? { createdAt: { ...(dto.desde ? { gte: dto.desde } : {}), ...(dto.hasta ? { lte: dto.hasta } : {}) } } : {}),
    };
    const [datos, total] = await Promise.all([
      this.prisma.notificacion.findMany({ where, orderBy: { createdAt: 'desc' }, skip: dto.skip, take: dto.limite }),
      this.prisma.notificacion.count({ where }),
    ]);
    return paginar(datos, total, dto);
  }

  /** Reenvía el texto guardado. No sirve para correos cuyo contenido útil no se guarda a propósito (contraseña, QR, adjuntos). */
  async reintentar(id: string) {
    const registro = await this.prisma.notificacion.findUnique({ where: { id } });
    if (!registro) throw new NotFoundException({ codigo: 'NOTIFICACION_NO_ENCONTRADA', mensaje: 'La notificación no existe' });
    if (registro.estado !== EstadoNotificacion.FALLIDA) throw new ConflictException({ codigo: 'NOTIFICACION_NO_FALLIDA', mensaje: 'Solo se pueden reintentar las notificaciones fallidas' });
    if (TIPOS_SIN_REENVIO.includes(registro.tipo) || !registro.destinatario.includes('@')) {
      throw new ConflictException({ codigo: 'NO_REINTENTABLE', mensaje: 'Este correo no se puede reenviar desde aquí: genere de nuevo la contraseña, la credencial o el reporte' });
    }
    try {
      await this.canal.enviar({ destinatario: registro.destinatario, asunto: registro.asunto, html: correoReenvio(registro.asunto, registro.mensaje), texto: registro.mensaje });
      return await this.prisma.notificacion.update({ where: { id }, data: { estado: EstadoNotificacion.ENVIADA, enviadaEn: new Date(), intentos: { increment: 1 }, error: null } });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      return this.prisma.notificacion.update({ where: { id }, data: { intentos: { increment: 1 }, error: mensaje.slice(0, 500) } });
    }
  }

  /** Correos activos de los usuarios internos con alguno de los roles indicados. */
  async destinatariosPorRol(roles: Rol[]): Promise<string[]> {
    const usuarios = await this.prisma.usuarioInterno.findMany({ where: { activo: true, rol: { in: roles } }, select: { correo: true } });
    return [...new Set(usuarios.map((u) => u.correo))];
  }

  private async enviarARoles(roles: Rol[], solicitud: Omit<SolicitudCorreo, 'destinatario'>): Promise<void> {
    const destinatarios = await this.destinatariosPorRol(roles);
    if (destinatarios.length === 0) {
      this.logger.warn(`Sin destinatarios activos para ${solicitud.tipo} (roles ${roles.join(', ')})`);
      return;
    }
    await Promise.all(destinatarios.map((destinatario) => this.enviarCorreo({ ...solicitud, destinatario })));
  }

  /** Envía un correo y registra el resultado en el historial. */
  async enviarCorreo(solicitud: SolicitudCorreo): Promise<void> {
    const registro = await this.prisma.notificacion.create({
      data: {
        canal: CanalEnum.CORREO,
        destinatario: solicitud.destinatario,
        asunto: solicitud.asunto,
        mensaje: solicitud.texto ?? solicitud.asunto,
        tipo: solicitud.tipo,
        visitaId: solicitud.visitaId ?? null,
        intentos: 1,
      },
    });
    try {
      await this.canal.enviar({
        destinatario: solicitud.destinatario,
        asunto: solicitud.asunto,
        html: solicitud.html,
        texto: solicitud.texto,
        adjuntos: solicitud.adjuntos,
      });
      await this.prisma.notificacion.update({
        where: { id: registro.id },
        data: { estado: EstadoNotificacion.ENVIADA, enviadaEn: new Date() },
      });
      this.eventos.publicar(Eventos.NOTIFICACION_ENVIADA, {
        tipo: TipoEvento.NOTIFICACION_ENVIADA,
        actor: ACTOR_SISTEMA,
        visitaId: solicitud.visitaId ?? null,
        entidad: 'notificacion',
        entidadId: registro.id,
        resultado: `${solicitud.tipo} enviada por correo`,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fallo al enviar ${solicitud.tipo} a ${solicitud.destinatario}: ${mensaje}`);
      await this.prisma.notificacion.update({
        where: { id: registro.id },
        data: { estado: EstadoNotificacion.FALLIDA, error: mensaje.slice(0, 500) },
      });
      this.eventos.publicar(Eventos.NOTIFICACION_FALLIDA, {
        tipo: TipoEvento.NOTIFICACION_FALLIDA,
        actor: ACTOR_SISTEMA,
        visitaId: solicitud.visitaId ?? null,
        entidad: 'notificacion',
        entidadId: registro.id,
        resultado: `${solicitud.tipo} fallida`,
        detalle: { error: mensaje.slice(0, 200) },
      });
    }
  }
}
