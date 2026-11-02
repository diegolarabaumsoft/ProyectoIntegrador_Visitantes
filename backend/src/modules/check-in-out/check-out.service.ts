import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../../config/env.js';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import type { EventoCheckOutRealizado, EventoIncidenciaDevolucion } from '../../eventos/payloads.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { TerminalBiometrico, Visita } from '../../generated/prisma/client.js';
import { EstadoAutorizacionTerminal, EstadoVisita, TipoEvento, type ElementoEpp } from '../../generated/prisma/enums.js';
import { AcsService } from '../../integraciones/acs/acs.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { CredencialesService } from '../credenciales/credenciales.service.js';
import { diaBogota, finDia, inicioDia } from '../reportes-kpi/fechas.js';
import { TerminalesService, type Actor } from '../terminales/terminales.service.js';
import { EppService, NOMBRE_EPP } from '../seguridad-industrial/epp.service.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';
import { EncuestaService } from './encuesta.controller.js';

/** Visitas que nunca llegaron a la planta: sin cierre impedirían anonimizar al visitante. */
const ESTADOS_SIN_INGRESO: EstadoVisita[] = [EstadoVisita.PROGRAMADA, EstadoVisita.PRE_REGISTRADA, EstadoVisita.BLOQUEADA];

/**
 * Check-out (CU-03, HU-13, HU-14, sección 7.3): devolución, incidencias,
 * invalidación del QR y revocación en el ACS. El ACS nunca impide la salida:
 * si no responde, la revocación queda en la cola de reenvío.
 */
@Injectable()
export class ServicioCheckOut {
  private readonly logger = new Logger(ServicioCheckOut.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly visitantes: VisitantesService,
    private readonly credenciales: CredencialesService,
    private readonly terminales: TerminalesService,
    private readonly epp: EppService,
    private readonly acs: AcsService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
    private readonly encuesta: EncuestaService,
    config: ConfigService<Env, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true }).replace(/\/$/, '');
  }

  async escanear(entrada: { codigo?: string; visitaId?: string }, usuario: UsuarioAutenticado) {
    if (entrada.codigo) {
      const validacion = await this.credenciales.validar(entrada.codigo, usuario.nombre, usuario.id);
      if (!validacion.valida) return { resultado: 'RECHAZADO' as const, motivo: validacion.motivo, mensaje: validacion.mensaje };
      return { resultado: 'VALIDA' as const, ficha: await this.ficha(validacion.visitaId) };
    }
    if (entrada.visitaId) return { resultado: 'VALIDA' as const, ficha: await this.ficha(entrada.visitaId) };
    throw new BadRequestException({ codigo: 'BUSQUEDA_INCOMPLETA', mensaje: 'Indique un código QR o una visita' });
  }

  async confirmar(visitaId: string, dto: { credencialDevuelta: boolean; eppDevuelto: ElementoEpp[] }, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.cargarEnPlanta(visitaId);
    // Va antes del cierre porque EppService rechaza las visitas finalizadas; repetirla no tiene efecto
    const { pendientes } = await this.epp.registrarDevolucion(visitaId, dto.eppDevuelto, usuario, ip);
    return this.cerrar(visita, pendientes, dto.credencialDevuelta, usuario, new Date(), ip);
  }

  /** D5: recepción registra lo devuelto y el visitante sale después por el torniquete. */
  async registrarDevolucion(visitaId: string, dto: { credencialDevuelta: boolean; eppDevuelto: ElementoEpp[] }, usuario: UsuarioAutenticado, ip?: string) {
    await this.cargarEnPlanta(visitaId);
    const { pendientes } = await this.epp.registrarDevolucion(visitaId, dto.eppDevuelto, usuario, ip);
    await this.prisma.credencialQr.updateMany({ where: { visitaId }, data: { fisicaDevuelta: dto.credencialDevuelta } });
    return { pendientes };
  }

  /** La huella en el terminal de salida cierra la visita (HU-13, Figura 17); lo pendiente de devolver genera incidencia. */
  async salidaPorTerminal(terminal: TerminalBiometrico, visitaId: string, hora: Date) {
    const activa = await this.prisma.visita.findUnique({ where: { id: visitaId }, select: { id: true, estado: true } });
    if (activa?.estado !== EstadoVisita.EN_PLANTA) {
      this.terminales.publicarPaso(terminal, activa?.id ?? null, hora, 'rechazado: sin check-in activo');
      throw new ConflictException({ codigo: 'SIN_CHECKIN_ACTIVO', mensaje: 'No hay check-in activo' });
    }
    await this.terminales.exigirAutorizacion(terminal, visitaId, hora);
    const visita = await this.cargarEnPlanta(visitaId);
    const [restantes, credencial] = await Promise.all([
      this.prisma.entregaEpp.findMany({ where: { visitaId, entregado: true, devuelto: false }, select: { elemento: true } }),
      this.prisma.credencialQr.findUnique({ where: { visitaId }, select: { fisicaDevuelta: true } }),
    ]);
    this.terminales.publicarPaso(terminal, visitaId, hora, 'salida registrada');
    return this.cerrar(visita, restantes.map((e) => e.elemento), credencial?.fisicaDevuelta ?? true, { nombre: terminal.nombre }, hora);
  }

  private async cerrar(visita: Awaited<ReturnType<ServicioCheckOut['cargarEnPlanta']>>, pendientes: ElementoEpp[], credencialDevuelta: boolean, usuario: Actor, horaSalida: Date, ip?: string) {
    const visitaId = visita.id;
    const publico = this.visitantes.resumen(visita.visitante);
    // Quien ingresó con huella no recibió ninguna credencial que deba devolver (HU-14)
    const tieneCredencial = (await this.prisma.credencialQr.count({ where: { visitaId } })) > 0;
    const cerrada = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.visita.updateMany({
        where: { id: visitaId, estado: EstadoVisita.EN_PLANTA },
        data: { estado: EstadoVisita.FINALIZADA, horaSalida },
      });
      if (count === 0) throw new ConflictException({ codigo: 'SIN_CHECKIN_ACTIVO', mensaje: 'No hay check-in activo' });
      await tx.movimientoZona.updateMany({ where: { visitaId, horaSalida: null }, data: { horaSalida } });
      await tx.credencialQr.updateMany({ where: { visitaId }, data: { fisicaDevuelta: credencialDevuelta } });
      return tx.visita.findUniqueOrThrow({ where: { id: visitaId } });
    });

    const revocacion = await this.cerrarAccesos(cerrada, usuario);

    const elementosPendientes = [...(credencialDevuelta || !tieneCredencial ? [] : ['Credencial física']), ...pendientes.map((e) => NOMBRE_EPP[e])];
    if (elementosPendientes.length > 0) {
      const incidencia: EventoIncidenciaDevolucion = {
        tipo: TipoEvento.INCIDENCIA_DEVOLUCION,
        actor: usuario.nombre,
        actorId: usuario.id ?? null,
        visitaId,
        entidad: 'visita',
        entidadId: visitaId,
        resultado: `elementos sin devolver: ${elementosPendientes.join(', ')}`,
        detalle: { credencialDevuelta: credencialDevuelta, eppPendiente: pendientes },
        ip,
        nombreVisitante: publico.nombreCompleto,
        empresa: publico.empresa,
        elementosPendientes,
        operador: usuario.nombre,
      };
      this.eventos.publicar(Eventos.INCIDENCIA_DEVOLUCION, incidencia);
    }
    const minutosEnPlanta = visita.horaIngreso ? Math.round((horaSalida.getTime() - visita.horaIngreso.getTime()) / 60_000) : null;
    const realizado: EventoCheckOutRealizado = {
      tipo: TipoEvento.CHECKOUT_REALIZADO,
      actor: usuario.nombre,
      actorId: usuario.id ?? null,
      visitaId,
      entidad: 'visita',
      entidadId: visitaId,
      resultado: elementosPendientes.length > 0 ? 'salida registrada con incidencias' : 'salida registrada',
      detalle: { minutosEnPlanta, incidencias: elementosPendientes.length, metodoIdentificacion: visita.metodoIdentificacion, origen: usuario.id ? 'CONSOLA' : 'TERMINAL' },
      ip,
      // El registro exprés puede no tener correo; el descifrado devuelve cadena vacía
      destinatario: publico.correo.includes('@') ? publico.correo : null,
      nombreVisitante: publico.nombreCompleto,
      enlaceEncuesta: `${this.frontendUrl}/pre-registro/encuesta/${this.encuesta.firmar(visitaId)}`,
    };
    this.eventos.publicar(Eventos.CHECKOUT_REALIZADO, realizado);

    return {
      visitaId,
      visitante: { nombreCompleto: publico.nombreCompleto, empresa: publico.empresa },
      horaSalida,
      incidencias: elementosPendientes,
      acs: { contingencia: revocacion.contingencia, detalle: revocacion.detalle },
    };
  }

  /** Salidas de hoy de visitas con terminales: quién salió, por dónde y si la plantilla ya se revocó (Tabla 16). */
  async salidasRecientes() {
    const hoy = diaBogota(new Date());
    const visitas = await this.prisma.visita.findMany({
      where: { horaSalida: { gte: inicioDia(hoy), lte: finDia(hoy) }, autorizacionesTerminal: { some: {} } },
      orderBy: { horaSalida: 'desc' },
      take: 10,
      include: {
        visitante: true,
        autorizacionesTerminal: { select: { estado: true } },
        eventos: { where: { tipoEvento: TipoEvento.PASO_TERMINAL, resultado: 'salida registrada' }, select: { actor: true }, take: 1 },
      },
    });
    return visitas.map((v) => {
      const { nombreCompleto, empresa } = this.visitantes.resumen(v.visitante);
      return {
        visitaId: v.id,
        visitante: { nombreCompleto, empresa },
        horaSalida: v.horaSalida,
        terminal: v.eventos[0]?.actor ?? null,
        revocacionesPendientes: v.autorizacionesTerminal.filter((a) => a.estado !== EstadoAutorizacionTerminal.REVOCADA).length,
      };
    });
  }

  /** Cierra como canceladas las visitas sin ingreso cuya ventana ya pasó, para que la retención pueda actuar. */
  @Cron(CronExpression.EVERY_HOUR)
  async cerrarVisitasVencidas(): Promise<{ cerradas: number }> {
    const ahora = new Date();
    const margenMin = await this.configuracion.numero('qr_margen_despues_min');
    const candidatas = await this.prisma.visita.findMany({
      where: { estado: { in: ESTADOS_SIN_INGRESO }, fechaProgramada: { lt: ahora } },
      select: { id: true, estado: true, fechaProgramada: true, tiempoAutorizadoMin: true },
    });
    let cerradas = 0;
    for (const visita of candidatas) {
      const limite = visita.fechaProgramada.getTime() + (visita.tiempoAutorizadoMin + margenMin) * 60_000;
      if (ahora.getTime() <= limite) continue;
      const { count } = await this.prisma.visita.updateMany({ where: { id: visita.id, estado: visita.estado }, data: { estado: EstadoVisita.CANCELADA } });
      if (count === 0) continue;
      cerradas++;
      // Un fallo aquí no debe frenar el resto; validar() ya rechaza las visitas canceladas
      await this.credenciales.invalidar(visita.id, 'Visita vencida sin ingreso').catch((error: unknown) => {
        this.logger.error(`No se pudo invalidar la credencial de la visita ${visita.id}`, error instanceof Error ? error.stack : String(error));
      });
      this.eventos.publicar(Eventos.VISITA_VENCIDA, {
        tipo: TipoEvento.INVITACION_CANCELADA,
        actor: ACTOR_SISTEMA,
        visitaId: visita.id,
        entidad: 'visita',
        entidadId: visita.id,
        resultado: 'visita vencida sin ingreso',
        detalle: { estadoAnterior: visita.estado },
      });
    }
    if (cerradas > 0) this.logger.log(`Visitas vencidas sin ingreso cerradas: ${cerradas}`);
    return { cerradas };
  }

  // ---------------------------------------------------------------

  /**
   * La salida ya está registrada y no se puede reintentar: un fallo aquí se avisa
   * a recepción en lugar de impedir los eventos del check-out.
   */
  private async cerrarAccesos(visita: Visita, usuario: Actor): Promise<{ contingencia: boolean; detalle: string }> {
    try {
      await this.credenciales.invalidar(visita.id, 'Check-out realizado', usuario.nombre, usuario.id);
      // Una autorización aún en cola no debe llegar al ACS después de la salida
      await this.prisma.colaAcsPendiente.deleteMany({ where: { visitaId: visita.id, enviadoEn: null, payload: { path: ['accion'], equals: 'AUTORIZAR' } } });
      const terminales = await this.terminales.revocarVisita(visita.id, usuario);
      if (terminales.usaTerminales) {
        return { contingencia: terminales.pendientes > 0, detalle: terminales.pendientes > 0 ? `${terminales.pendientes} terminal(es) fuera de línea: la revocación quedó en cola` : 'Plantilla revocada en todos los terminales' };
      }
      return await this.acs.revocarPaso(visita, usuario.nombre, usuario.id);
    } catch (error) {
      this.logger.error(`No se pudo revocar el acceso de la visita ${visita.id}`, error instanceof Error ? error.stack : String(error));
      return { contingencia: true, detalle: 'No se pudo revocar el paso. Avise a Seguridad' };
    }
  }

  private async ficha(visitaId: string) {
    const visita = await this.cargarEnPlanta(visitaId);
    const publico = this.visitantes.resumen(visita.visitante);
    return {
      visita: { id: visita.id, horaIngreso: visita.horaIngreso, tiempoAutorizadoMin: visita.tiempoAutorizadoMin, motivo: visita.motivo },
      visitante: { nombreCompleto: publico.nombreCompleto, empresa: publico.empresa },
      anfitrion: visita.anfitrion.nombre,
      epp: visita.entregasEpp.filter((e) => e.entregado && !e.devuelto).map((e) => e.elemento),
      tieneCredencial: (await this.prisma.credencialQr.count({ where: { visitaId } })) > 0,
      usaTerminales: (await this.prisma.autorizacionTerminal.count({ where: { visitaId } })) > 0,
    };
  }

  private async cargarEnPlanta(visitaId: string) {
    const visita = await this.prisma.visita.findUnique({
      where: { id: visitaId },
      include: { visitante: true, anfitrion: { select: { nombre: true } }, entregasEpp: true },
    });
    if (!visita) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    if (visita.estado !== EstadoVisita.EN_PLANTA) throw new ConflictException({ codigo: 'SIN_CHECKIN_ACTIVO', mensaje: 'No hay check-in activo' });
    return visita;
  }
}
