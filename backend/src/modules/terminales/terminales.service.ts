import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { TerminalBiometrico, Visita } from '../../generated/prisma/client.js';
import { EstadoAutorizacionTerminal, EstadoVisita, TipoEvento, TipoTerminal } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { EventoTerminalFueraLinea } from '../../eventos/payloads.js';
import type { CrearTerminalDto, EditarTerminalDto } from './dto/terminales.dto.js';
import { TERMINAL_BIOMETRICO, TerminalSimulado, type ITerminalBiometrico } from './terminal-biometrico.js';

export interface Actor {
  nombre: string;
  id?: string;
}

export interface ResultadoCarga {
  /** No hay terminales activos: el ingreso sigue por el control de acceso general */
  sinTerminales: boolean;
  contingencia: boolean;
  detalle: string;
}

/**
 * Terminales biométricos (HU-09, HU-12, HU-14, RNF-04). Cada autorización es una fila
 * con su estado: una carga o revocación fallida queda pendiente y se reintenta, sin
 * guardar plantillas en ninguna cola. Las plantillas se descifran solo para enviarlas.
 */
@Injectable()
export class TerminalesService {
  private readonly logger = new Logger(TerminalesService.name);
  private reintentando = false;
  /** Desde cuándo no responde cada terminal: una falla breve no debe generar una alerta. */
  private readonly sinRespuestaDesde = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
    @Inject(TERMINAL_BIOMETRICO) private readonly terminal: ITerminalBiometrico,
  ) {}

  /** Carga la plantilla en la entrada, la salida y las zonas autorizadas. El bloqueo por restricción ya ocurrió. */
  async autorizarVisita(visita: Visita, horaIngreso: Date, actor: Actor): Promise<ResultadoCarga> {
    const zonas = await this.prisma.visitaZona.findMany({ where: { visitaId: visita.id }, select: { zonaId: true } });
    const destinos = await this.prisma.terminalBiometrico.findMany({
      where: { activo: true, OR: [{ tipo: { in: [TipoTerminal.ENTRADA, TipoTerminal.SALIDA] } }, { tipo: TipoTerminal.ZONA, zonaId: { in: zonas.map((z) => z.zonaId) } }] },
    });
    if (!destinos.some((d) => d.tipo === TipoTerminal.ENTRADA)) {
      return { sinTerminales: true, contingencia: false, detalle: 'No hay un terminal de entrada activo' };
    }
    const margen = await this.configuracion.numero('qr_margen_despues_min');
    const vigenteHasta = new Date(horaIngreso.getTime() + (visita.tiempoAutorizadoMin + margen) * 60_000);
    const resultados = await Promise.all(destinos.map((d) => this.cargarEn(d, visita, horaIngreso, vigenteHasta, actor)));
    const entradaCaida = destinos.some((d, i) => d.tipo === TipoTerminal.ENTRADA && !resultados[i]);
    const pendientes = resultados.filter((ok) => !ok).length;
    if (entradaCaida) {
      return { sinTerminales: false, contingencia: true, detalle: 'El terminal de entrada no respondió. Habilite el paso manualmente; la autorización quedó en cola' };
    }
    return { sinTerminales: false, contingencia: false, detalle: pendientes ? `${pendientes} terminal(es) pendiente(s) de sincronizar` : 'Plantilla cargada en los terminales' };
  }

  /** Autoriza una zona durante la visita. Si la visita usa terminales, carga la plantilla en sus lectores. */
  async autorizarZona(visita: Visita, zonaId: string, actor: Actor): Promise<void> {
    await this.prisma.visitaZona.upsert({ where: { visitaId_zonaId: { visitaId: visita.id, zonaId } }, create: { visitaId: visita.id, zonaId }, update: {} });
    const yaUsaTerminales = await this.prisma.autorizacionTerminal.findFirst({ where: { visitaId: visita.id } });
    if (!yaUsaTerminales || !visita.horaIngreso) return;
    const destinos = await this.prisma.terminalBiometrico.findMany({ where: { activo: true, tipo: TipoTerminal.ZONA, zonaId } });
    await Promise.all(destinos.map((d) => this.cargarEn(d, visita, new Date(), yaUsaTerminales.vigenteHasta, actor)));
  }

  /** Elimina la plantilla de todos los terminales. Devuelve false si la visita nunca usó terminales. */
  async revocarVisita(visitaId: string, actor: Actor): Promise<{ usaTerminales: boolean; pendientes: number }> {
    const autorizaciones = await this.prisma.autorizacionTerminal.findMany({
      where: { visitaId, estado: { not: EstadoAutorizacionTerminal.REVOCADA } },
      include: { terminal: true },
    });
    const total = await this.prisma.autorizacionTerminal.count({ where: { visitaId } });
    if (total === 0) return { usaTerminales: false, pendientes: 0 };
    await this.prisma.autorizacionTerminal.updateMany({ where: { visitaId, estado: { not: EstadoAutorizacionTerminal.REVOCADA }, revocacionSolicitadaEn: null }, data: { revocacionSolicitadaEn: new Date() } });
    const resultados = await Promise.all(autorizaciones.map((a) => this.revocarEn(a.id, a.terminal, visitaId, actor)));
    return { usaTerminales: true, pendientes: resultados.filter((ok) => !ok).length };
  }

  /** Reintenta lo pendiente: las revocaciones van primero para no dejar accesos abiertos (HU-14). */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async reintentarPendientes(): Promise<{ revocadas: number; cargadas: number }> {
    if (this.reintentando) return { revocadas: 0, cargadas: 0 };
    this.reintentando = true;
    let revocadas = 0;
    let cargadas = 0;
    try {
      const porRevocar = await this.prisma.autorizacionTerminal.findMany({
        where: { revocacionSolicitadaEn: { not: null }, estado: { not: EstadoAutorizacionTerminal.REVOCADA } },
        include: { terminal: true },
        take: 100,
      });
      for (const a of porRevocar) if (await this.revocarEn(a.id, a.terminal, a.visitaId, { nombre: ACTOR_SISTEMA })) revocadas++;

      const porCargar = await this.prisma.autorizacionTerminal.findMany({
        where: { estado: EstadoAutorizacionTerminal.PENDIENTE, revocacionSolicitadaEn: null, vigenteHasta: { gt: new Date() }, visita: { estado: EstadoVisita.EN_PLANTA } },
        include: { terminal: true, visita: true },
        take: 100,
      });
      for (const a of porCargar) if (await this.cargarEn(a.terminal, a.visita, a.vigenteDesde, a.vigenteHasta, { nombre: ACTOR_SISTEMA })) cargadas++;
      return { revocadas, cargadas };
    } catch (error) {
      this.logger.error('No se pudieron reintentar las operaciones de terminales', error instanceof Error ? error.stack : String(error));
      return { revocadas, cargadas };
    } finally {
      this.reintentando = false;
    }
  }

  /** Panel de administración (HU-38). Nunca expone el hash del secreto. */
  async listar() {
    const terminales = await this.prisma.terminalBiometrico.findMany({
      include: { zona: { select: { id: true, nombre: true } }, autorizaciones: { where: { estado: EstadoAutorizacionTerminal.PENDIENTE }, select: { id: true } } },
      orderBy: [{ activo: 'desc' }, { tipo: 'asc' }, { nombre: 'asc' }],
    });
    const porRevocar = await this.prisma.autorizacionTerminal.groupBy({
      by: ['terminalId'],
      where: { revocacionSolicitadaEn: { not: null }, estado: { not: EstadoAutorizacionTerminal.REVOCADA } },
      _count: { _all: true },
    });
    return {
      simulado: this.terminal.simulado,
      terminales: terminales.map(({ secretoHash, autorizaciones, ...t }) => ({
        ...t,
        tieneSecreto: Boolean(secretoHash),
        pendientes: autorizaciones.length + (porRevocar.find((p) => p.terminalId === t.id)?._count._all ?? 0),
        simuladoEnLinea: this.terminal instanceof TerminalSimulado ? this.terminal.estaEnLinea(t.id) : null,
      })),
    };
  }

  /** El secreto solo se muestra al crearlo o regenerarlo: en la base queda su hash. */
  async crear(dto: CrearTerminalDto, actor: Actor) {
    await this.validarDatos(dto.tipo, dto.zonaId, dto.nombre);
    const secreto = randomBytes(32).toString('base64url');
    const terminal = await this.prisma.terminalBiometrico.create({
      data: { nombre: dto.nombre.trim(), tipo: dto.tipo, zonaId: dto.tipo === TipoTerminal.ZONA ? dto.zonaId : null, ip: dto.ip.trim(), secretoHash: this.crypto.hashToken(secreto) },
    });
    this.publicarAdministracion(terminal, actor, 'terminal registrado');
    return { id: terminal.id, secreto };
  }

  async editar(id: string, dto: EditarTerminalDto, actor: Actor) {
    const actual = await this.buscarExistente(id);
    const tipo = dto.tipo ?? actual.tipo;
    const zonaId = tipo === TipoTerminal.ZONA ? (dto.zonaId ?? actual.zonaId ?? undefined) : undefined;
    await this.validarDatos(tipo, zonaId, dto.nombre ?? actual.nombre, id);
    if (dto.activo === false) await this.exigirSinAccesosVigentes(id);
    const terminal = await this.prisma.terminalBiometrico.update({
      where: { id },
      data: { ...(dto.nombre ? { nombre: dto.nombre.trim() } : {}), ...(dto.ip ? { ip: dto.ip.trim() } : {}), ...(dto.activo !== undefined ? { activo: dto.activo } : {}), tipo, zonaId: zonaId ?? null },
    });
    this.publicarAdministracion(terminal, actor, dto.activo === false ? 'terminal desactivado' : 'terminal actualizado');
    return { id: terminal.id };
  }

  async regenerarSecreto(id: string, actor: Actor) {
    const terminal = await this.buscarExistente(id);
    const secreto = randomBytes(32).toString('base64url');
    await this.prisma.terminalBiometrico.update({ where: { id }, data: { secretoHash: this.crypto.hashToken(secreto) } });
    this.publicarAdministracion(terminal, actor, 'secreto del terminal regenerado');
    return { id, secreto };
  }

  /** Sincronización manual: consulta el estado y envía lo pendiente. */
  async sincronizar(id: string) {
    await this.buscarActivo(id);
    await this.sondearTerminales();
    await this.reintentarPendientes();
    return this.listar();
  }

  /** Marca fuera de línea tras el tiempo configurado sin respuesta y avisa a Seguridad una sola vez (HU-38). */
  @Cron(CronExpression.EVERY_MINUTE)
  async sondearTerminales(ahora = new Date()): Promise<void> {
    const [timeoutMs, toleranciaMin] = await Promise.all([this.configuracion.numero('acs_timeout_ms'), this.configuracion.numero('terminal_fuera_linea_min')]);
    const terminales = await this.prisma.terminalBiometrico.findMany({ where: { activo: true } });
    await Promise.all(
      terminales.map(async (terminal) => {
        if (await this.terminal.sondear(terminal, timeoutMs)) {
          this.sinRespuestaDesde.delete(terminal.id);
          await this.prisma.terminalBiometrico.update({ where: { id: terminal.id }, data: { enLinea: true, ultimaSincronizacion: ahora } });
          if (!terminal.enLinea && terminal.ultimaSincronizacion) this.publicarEstado(Eventos.TERMINAL_RECUPERADO, TipoEvento.TERMINAL_RECUPERADO, terminal, 'terminal en línea');
          return;
        }
        const desde = this.sinRespuestaDesde.get(terminal.id) ?? ahora;
        this.sinRespuestaDesde.set(terminal.id, desde);
        if (!terminal.enLinea || ahora.getTime() - desde.getTime() < toleranciaMin * 60_000) return;
        await this.prisma.terminalBiometrico.update({ where: { id: terminal.id }, data: { enLinea: false } });
        this.publicarEstado(Eventos.TERMINAL_FUERA_LINEA, TipoEvento.TERMINAL_FUERA_LINEA, terminal, 'terminal fuera de línea');
      }),
    );
  }

  /** Un terminal real se autentica con su secreto, nunca con una sesión de usuario. */
  async autenticar(terminalId: string, secreto: string | undefined): Promise<TerminalBiometrico> {
    const terminal = await this.prisma.terminalBiometrico.findFirst({ where: { id: terminalId, activo: true } });
    if (!terminal?.secretoHash || !secreto || this.crypto.hashToken(secreto) !== terminal.secretoHash) {
      throw new UnauthorizedException({ codigo: 'TERMINAL_NO_AUTORIZADO', mensaje: 'Terminal no autorizado' });
    }
    return terminal;
  }

  async buscarActivo(terminalId: string): Promise<TerminalBiometrico> {
    const terminal = await this.prisma.terminalBiometrico.findFirst({ where: { id: terminalId, activo: true } });
    if (!terminal) throw new NotFoundException({ codigo: 'TERMINAL_NO_ENCONTRADO', mensaje: 'El terminal no existe o está inactivo' });
    return terminal;
  }

  exigirSimulado(): TerminalSimulado {
    if (!(this.terminal instanceof TerminalSimulado)) {
      throw new ConflictException({ codigo: 'TERMINAL_NO_SIMULADO', mensaje: 'Esta operación solo existe con terminales simulados' });
    }
    return this.terminal;
  }

  /** Paso por la entrada o por un lector de zona. La salida la atiende la fachada de check-out. */
  async registrarPaso(terminal: TerminalBiometrico, visitaId: string, hora: Date) {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId } });
    if (!visita || visita.estado !== EstadoVisita.EN_PLANTA) {
      // Un identificador inexistente no puede referenciarse en la bitácora
      this.publicarPaso(terminal, visita?.id ?? null, hora, 'rechazado: sin check-in activo');
      throw new ConflictException({ codigo: 'SIN_CHECKIN_ACTIVO', mensaje: 'La visita no tiene un check-in activo' });
    }
    await this.exigirAutorizacion(terminal, visitaId, hora);

    if (terminal.tipo === TipoTerminal.ENTRADA) {
      await this.prisma.visita.updateMany({ where: { id: visitaId, ingresoFisicoEn: null }, data: { ingresoFisicoEn: hora } });
      this.publicarPaso(terminal, visitaId, hora, 'entrada registrada');
      return { resultado: 'ENTRADA' as const };
    }
    return this.registrarPasoZona(terminal, visita, hora);
  }

  /** Antes del cierre de la salida: el terminal solo acepta plantillas que tenga cargadas. */
  async exigirAutorizacion(terminal: TerminalBiometrico, visitaId: string, hora: Date): Promise<void> {
    const autorizacion = await this.prisma.autorizacionTerminal.findUnique({ where: { visitaId_terminalId: { visitaId, terminalId: terminal.id } } });
    if (autorizacion?.estado !== EstadoAutorizacionTerminal.CARGADA || autorizacion.vigenteHasta <= hora) {
      this.publicarPaso(terminal, visitaId, hora, 'rechazado: sin autorización en este terminal');
      throw new ForbiddenException({ codigo: 'SIN_AUTORIZACION_TERMINAL', mensaje: 'El visitante no tiene autorización vigente en este terminal' });
    }
  }

  publicarPaso(terminal: TerminalBiometrico, visitaId: string | null, hora: Date, resultado: string): void {
    this.eventos.publicar(Eventos.PASO_TERMINAL, {
      tipo: TipoEvento.PASO_TERMINAL,
      actor: terminal.nombre,
      visitaId,
      entidad: 'terminal',
      entidadId: terminal.id,
      resultado,
      detalle: { tipoTerminal: terminal.tipo, hora: hora.toISOString() },
    });
  }

  // ---------------------------------------------------------------

  private async buscarExistente(id: string): Promise<TerminalBiometrico> {
    const terminal = await this.prisma.terminalBiometrico.findUnique({ where: { id } });
    if (!terminal) throw new NotFoundException({ codigo: 'TERMINAL_NO_ENCONTRADO', mensaje: 'El terminal no existe' });
    return terminal;
  }

  private async validarDatos(tipo: TipoTerminal, zonaId: string | undefined, nombre: string, id?: string): Promise<void> {
    if (tipo === TipoTerminal.ZONA && !zonaId) {
      throw new UnprocessableEntityException({ codigo: 'ZONA_REQUERIDA', mensaje: 'Un lector de zona debe tener una zona' });
    }
    if (zonaId && !(await this.prisma.zona.findFirst({ where: { id: zonaId, activa: true }, select: { id: true } }))) {
      throw new UnprocessableEntityException({ codigo: 'ZONA_INVALIDA', mensaje: 'La zona indicada no existe o está inactiva' });
    }
    const repetido = await this.prisma.terminalBiometrico.findFirst({ where: { nombre: nombre.trim(), ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (repetido) throw new ConflictException({ codigo: 'TERMINAL_DUPLICADO', mensaje: 'Ya existe un terminal con ese nombre' });
  }

  /** Desactivarlo dejaría plantillas cargadas en un equipo que ya no se sondea ni se administra. */
  private async exigirSinAccesosVigentes(terminalId: string): Promise<void> {
    const vigentes = await this.prisma.autorizacionTerminal.count({ where: { terminalId, estado: { not: EstadoAutorizacionTerminal.REVOCADA } } });
    if (vigentes > 0) {
      throw new ConflictException({ codigo: 'TERMINAL_CON_PLANTILLAS', mensaje: 'El terminal tiene plantillas cargadas. Espere a que salgan esos visitantes' });
    }
  }

  private publicarAdministracion(terminal: TerminalBiometrico, actor: Actor, resultado: string): void {
    this.publicarOperacion(Eventos.CONFIGURACION_MODIFICADA, TipoEvento.CONFIGURACION_MODIFICADA, terminal, null, actor, resultado);
  }

  private publicarEstado(nombre: typeof Eventos.TERMINAL_FUERA_LINEA | typeof Eventos.TERMINAL_RECUPERADO, tipo: TipoEvento, terminal: TerminalBiometrico, resultado: string): void {
    const evento: EventoTerminalFueraLinea = {
      tipo,
      actor: ACTOR_SISTEMA,
      entidad: 'terminal',
      entidadId: terminal.id,
      resultado: `${resultado}: ${terminal.nombre}`,
      nombreTerminal: terminal.nombre,
      tipoTerminal: terminal.tipo,
      ultimaSincronizacion: terminal.ultimaSincronizacion,
    };
    this.eventos.publicar(nombre, evento);
  }

  private async registrarPasoZona(terminal: TerminalBiometrico, visita: Visita, hora: Date) {
    const zona = terminal.zonaId ? await this.prisma.zona.findFirst({ where: { id: terminal.zonaId, activa: true } }) : null;
    if (!zona) throw new UnprocessableEntityException({ codigo: 'ZONA_INVALIDA', mensaje: 'El lector no tiene una zona activa' });
    if (zona.requiereAcompanante && !visita.acompananteId) {
      this.publicarPaso(terminal, visita.id, hora, 'rechazado: la zona exige acompañante');
      throw new ForbiddenException({ codigo: 'REQUIERE_ACOMPANANTE', mensaje: `La zona ${zona.nombre} exige un acompañante` });
    }
    const movimiento = await this.prisma.$transaction(async (tx) => {
      await tx.movimientoZona.updateMany({ where: { visitaId: visita.id, horaSalida: null }, data: { horaSalida: hora } });
      return tx.movimientoZona.create({ data: { visitaId: visita.id, zonaId: zona.id, horaEntrada: hora } });
    });
    this.publicarPaso(terminal, visita.id, hora, `entrada a ${zona.nombre}`);
    this.eventos.publicar(Eventos.MOVIMIENTO_ZONA, {
      tipo: TipoEvento.MOVIMIENTO_ZONA,
      actor: terminal.nombre,
      visitaId: visita.id,
      entidad: 'movimiento_zona',
      entidadId: movimiento.id,
      resultado: `entrada a ${zona.nombre}`,
      detalle: { zonaId: zona.id, esSensible: zona.esSensible },
    });
    return { resultado: 'ZONA' as const, zona: zona.nombre };
  }

  private async cargarEn(terminal: TerminalBiometrico, visita: Visita, vigenteDesde: Date, vigenteHasta: Date, actor: Actor): Promise<boolean> {
    const plantillas = await this.prisma.plantillaBiometrica.findMany({
      where: { visitanteId: visita.visitanteId, revocadaEn: null, venceEn: { gt: new Date() } },
      select: { dedo: true, formato: true, datoCifrado: true },
    });
    const timeoutMs = await this.configuracion.numero('acs_timeout_ms');
    const resultado = await this.terminal.cargar(
      terminal,
      { visitaId: visita.id, plantillas: plantillas.map((p) => ({ dedo: p.dedo, formato: p.formato, plantilla: this.crypto.descifrar(p.datoCifrado) })), vigenteDesde, vigenteHasta },
      timeoutMs,
    );
    const estado = resultado.ok ? EstadoAutorizacionTerminal.CARGADA : EstadoAutorizacionTerminal.PENDIENTE;
    const enviadaEn = resultado.ok ? new Date() : null;
    await this.prisma.autorizacionTerminal.upsert({
      where: { visitaId_terminalId: { visitaId: visita.id, terminalId: terminal.id } },
      create: { visitaId: visita.id, terminalId: terminal.id, vigenteDesde, vigenteHasta, estado, enviadaEn },
      update: { estado, enviadaEn },
    });
    if (resultado.ok) {
      await this.prisma.terminalBiometrico.update({ where: { id: terminal.id }, data: { enLinea: true, ultimaSincronizacion: new Date() } });
      this.publicarOperacion(Eventos.PLANTILLA_CARGADA, TipoEvento.PLANTILLA_CARGADA, terminal, visita.id, actor, 'plantilla cargada');
    } else {
      this.publicarContingencia(terminal, visita.id, actor, 'carga', resultado.error);
    }
    return resultado.ok;
  }

  private async revocarEn(autorizacionId: string, terminal: TerminalBiometrico, visitaId: string, actor: Actor): Promise<boolean> {
    const timeoutMs = await this.configuracion.numero('acs_timeout_ms');
    const resultado = await this.terminal.revocar(terminal, visitaId, timeoutMs);
    if (!resultado.ok) {
      this.publicarContingencia(terminal, visitaId, actor, 'revocación', resultado.error);
      return false;
    }
    await this.prisma.autorizacionTerminal.update({ where: { id: autorizacionId }, data: { estado: EstadoAutorizacionTerminal.REVOCADA, revocadaEn: new Date() } });
    await this.prisma.terminalBiometrico.update({ where: { id: terminal.id }, data: { enLinea: true, ultimaSincronizacion: new Date() } });
    this.publicarOperacion(Eventos.PLANTILLA_REVOCADA, TipoEvento.PLANTILLA_REVOCADA, terminal, visitaId, actor, 'plantilla revocada');
    return true;
  }

  private publicarOperacion(nombre: string, tipo: TipoEvento, terminal: TerminalBiometrico, visitaId: string | null, actor: Actor, resultado: string): void {
    this.eventos.publicar(nombre as (typeof Eventos)[keyof typeof Eventos], { tipo, actor: actor.nombre, actorId: actor.id ?? null, visitaId, entidad: 'terminal', entidadId: terminal.id, resultado: `${resultado}: ${terminal.nombre}` });
  }

  private publicarContingencia(terminal: TerminalBiometrico, visitaId: string, actor: Actor, operacion: string, error?: string): void {
    this.eventos.publicar(Eventos.ACS_CONTINGENCIA, {
      tipo: TipoEvento.ACS_CONTINGENCIA,
      actor: actor.nombre,
      actorId: actor.id ?? null,
      visitaId,
      entidad: 'terminal',
      entidadId: terminal.id,
      resultado: `${operacion} pendiente en ${terminal.nombre}; se reintentará`,
      detalle: { error: error ?? null, selloTiempo: new Date().toISOString() },
    });
  }
}
