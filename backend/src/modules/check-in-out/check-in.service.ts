import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import type { EventoCheckInBloqueado, EventoCheckInRealizado, EventoExcepcionRegistrada } from '../../eventos/payloads.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { EstadoVisita, MetodoId, Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { AcsService } from '../../integraciones/acs/acs.service.js';
import { BiometriaService } from '../biometria/biometria.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { CredencialesService } from '../credenciales/credenciales.service.js';
import { RestriccionesService, type Coincidencia } from '../restricciones/restricciones.service.js';
import { EppService, NOMBRE_EPP, type EstadoEpp } from '../seguridad-industrial/epp.service.js';
import { InduccionService, type RespuestaInduccion } from '../seguridad-industrial/induccion.service.js';
import { TerminalesService } from '../terminales/terminales.service.js';
import { VisitantesService, type VisitantePublico } from '../visitantes/visitantes.service.js';
import type { ConfirmarCheckInDto, EmitirCredencialAlternativaDto, RegistrarExcepcionDto, RegistroExpresDto } from './dto/check-in.dto.js';

const INCLUIR = {
  visitante: true,
  anfitrion: { select: { id: true, nombre: true, correo: true, area: true } },
  acompanante: { select: { id: true, nombre: true } },
  credencial: true,
  consentimiento: true,
  excepcion: true,
  vehiculo: true,
} satisfies Prisma.VisitaInclude;

type VisitaCompleta = Prisma.VisitaGetPayload<{ include: typeof INCLUIR }>;

export type EstadoRestriccion = 'SIN_COINCIDENCIA' | 'COINCIDENCIA' | 'EXCEPCION';

export interface Requisitos {
  credencial: { vigente: boolean; venceEn: Date | null };
  /** Cómo se identificaría al visitante si se autoriza ahora (HU-07, HU-40) */
  identificacion: { metodo: MetodoId | null; autorizaBiometria: boolean; enrolada: boolean };
  induccion: { vigente: boolean; venceEn: Date | null };
  restriccion: { estado: EstadoRestriccion; motivo?: string; fechaRegistro?: Date; autorizadoPor?: string };
  epp: EstadoEpp;
  /** true cuando identificación, inducción, restricción y EPP permiten autorizar; la identidad la confirma recepción */
  completos: boolean;
}

/** Visitas sobre las que recepción puede actuar o que debe poder encontrar. */
const ESTADOS_BUSQUEDA: EstadoVisita[] = [EstadoVisita.PROGRAMADA, EstadoVisita.PRE_REGISTRADA, EstadoVisita.BLOQUEADA, EstadoVisita.EN_PLANTA];
const VENTANA_BUSQUEDA_MS = 24 * 60 * 60_000;

/**
 * Fachada del check-in (CU-02, CU-05, sección 7.2 del plan). Orquesta credencial,
 * restricción, inducción, EPP y ACS. El bloqueo ocurre antes de contactar al ACS;
 * notificaciones y bitácora reaccionan a los eventos de forma asíncrona (RNF-01).
 */
@Injectable()
export class ServicioCheckIn {
  private readonly logger = new Logger(ServicioCheckIn.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly visitantes: VisitantesService,
    private readonly credenciales: CredencialesService,
    private readonly restricciones: RestriccionesService,
    private readonly induccion: InduccionService,
    private readonly epp: EppService,
    private readonly acs: AcsService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
    private readonly biometria: BiometriaService,
    private readonly terminales: TerminalesService,
  ) {}

  /** Valida el QR y devuelve la ficha. No cambia de estado (HU-06, HU-07). */
  async escanear(codigo: string, usuario: UsuarioAutenticado) {
    const validacion = await this.credenciales.validar(codigo, usuario.nombre, usuario.id);
    if (!validacion.valida) {
      return { resultado: 'RECHAZADO' as const, motivo: validacion.motivo, mensaje: validacion.mensaje };
    }
    return { resultado: 'VALIDA' as const, ficha: await this.ficha(validacion.visitaId) };
  }

  /** Búsqueda manual: por documento (hash) o por nombre entre las visitas de hoy (±1 día). */
  async buscar(documento: string | undefined, nombre: string | undefined) {
    const doc = documento?.trim();
    const texto = nombre?.trim().toLocaleLowerCase('es');
    if (!doc && (!texto || texto.length < 3)) {
      throw new UnprocessableEntityException({ codigo: 'BUSQUEDA_INCOMPLETA', mensaje: 'Indique un documento o al menos 3 letras del nombre' });
    }
    const ahora = Date.now();
    // El nombre está cifrado: se descifra en memoria dentro de una ventana acotada
    const visitas = await this.prisma.visita.findMany({
      where: {
        estado: { in: ESTADOS_BUSQUEDA },
        ...(doc
          ? { visitante: { numeroDocumentoHash: this.crypto.hashDocumento(doc), anonimizado: false } }
          : { fechaProgramada: { gte: new Date(ahora - VENTANA_BUSQUEDA_MS), lte: new Date(ahora + VENTANA_BUSQUEDA_MS) }, visitante: { anonimizado: false } }),
      },
      include: { visitante: true, anfitrion: { select: { nombre: true } } },
      orderBy: { fechaProgramada: 'desc' },
    });
    return visitas
      .map((v) => ({ v, p: this.visitantes.resumen(v.visitante) }))
      .filter(({ p }) => doc || p.nombreCompleto.toLocaleLowerCase('es').includes(texto!))
      .slice(0, 20)
      .map(({ v, p }) => ({
        visitaId: v.id,
        estado: v.estado,
        fechaProgramada: v.fechaProgramada,
        motivo: v.motivo,
        visitante: { nombreCompleto: p.nombreCompleto, empresa: p.empresa },
        anfitrion: v.anfitrion.nombre,
      }));
  }

  /** Ficha del visitante con la lista de verificación (R2). */
  async ficha(visitaId: string) {
    const visita = await this.cargar(visitaId);
    const publico = this.visitantes.descifrar(visita.visitante);
    const { requisitos } = await this.evaluar(visita, publico);
    return {
      visita: {
        id: visita.id,
        estado: visita.estado,
        fechaProgramada: visita.fechaProgramada,
        motivo: visita.motivo,
        tiempoAutorizadoMin: visita.tiempoAutorizadoMin,
        horaIngreso: visita.horaIngreso,
        modoContingencia: visita.modoContingencia,
        esExpres: visita.esExpres,
      },
      visitante: {
        nombreCompleto: publico.nombreCompleto,
        tipoDocumento: publico.tipoDocumento,
        numeroDocumento: publico.numeroDocumento,
        empresa: publico.empresa,
      },
      anfitrion: { nombre: visita.anfitrion.nombre, area: visita.anfitrion.area },
      requisitos,
      contingencia: visita.modoContingencia ? await this.pasoManual(visita.id) : null,
    };
  }

  /** Flujo completo: restricción → requisitos → ACS → EN_PLANTA → eventos (sección 7.2). */
  async confirmar(visitaId: string, dto: ConfirmarCheckInDto, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.cargar(visitaId);
    this.exigirConfirmable(visita.estado);
    const publico = this.visitantes.descifrar(visita.visitante);
    const { requisitos, coincidencia } = await this.evaluar(visita, publico);

    if (coincidencia && requisitos.restriccion.estado === 'COINCIDENCIA') {
      await this.bloquear(visita, publico, coincidencia, usuario, ip);
      return { resultado: 'BLOQUEADO' as const, motivo: coincidencia.motivo, fechaRegistro: coincidencia.fechaRegistro, ficha: await this.ficha(visitaId) };
    }
    if (!requisitos.completos) {
      return { resultado: 'RECHAZADO' as const, motivo: this.motivoRequisitos(requisitos), ficha: await this.ficha(visitaId) };
    }
    await this.exigirDatosOpcionales(dto);
    await this.exigirNoPresente(visita.visitanteId, visita.id);

    const horaIngreso = new Date();
    // Reclamo atómico antes del ACS: dos confirmaciones simultáneas no autorizan dos veces
    const movimientoId = await this.reclamarIngreso(visita, dto, horaIngreso, usuario, requisitos.identificacion.metodo);
    let autorizacion: { contingencia: boolean; detalle: string; referenciaAcs?: string };
    try {
      autorizacion = await this.autorizarAcceso(visita, requisitos.identificacion.metodo, horaIngreso, usuario);
    } catch (error) {
      await this.revertirIngreso(visita, movimientoId);
      throw error;
    }
    if (autorizacion.contingencia) {
      // La autorización ya está en cola: un fallo aquí no debe impedir el evento de ingreso
      await this.prisma.visita.update({ where: { id: visita.id }, data: { modoContingencia: true } }).catch((error: unknown) => {
        this.logger.error(`No se pudo marcar la contingencia de la visita ${visita.id}`, error instanceof Error ? error.stack : String(error));
      });
    }

    const evento: EventoCheckInRealizado = {
      tipo: TipoEvento.CHECKIN_REALIZADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId: visita.id,
      entidad: 'visita',
      entidadId: visita.id,
      resultado: autorizacion.contingencia ? 'ingreso en modo de contingencia' : 'ingreso autorizado',
      detalle: { modoContingencia: autorizacion.contingencia, esExpres: visita.esExpres, referenciaAcs: autorizacion.referenciaAcs ?? null, metodoIdentificacion: requisitos.identificacion.metodo },
      ip,
      nombreVisitante: publico.nombreCompleto,
      empresa: publico.empresa,
      horaIngreso,
      anfitrion: { id: visita.anfitrion.id, nombre: visita.anfitrion.nombre, correo: visita.anfitrion.correo },
      modoContingencia: autorizacion.contingencia,
    };
    this.eventos.publicar(Eventos.CHECKIN_REALIZADO, evento);
    if (requisitos.identificacion.metodo === MetodoId.HUELLA) {
      // El ingreso ya ocurrió: un fallo aquí solo adelantaría la purga
      await this.biometria.renovarVigencia(visita.visitanteId).catch((error: unknown) => {
        this.logger.error(`No se renovó la vigencia de las plantillas de la visita ${visita.id}`, error instanceof Error ? error.stack : String(error));
      });
    }
    this.publicarDatosOpcionales(visita.id, dto, movimientoId, usuario, ip);

    return {
      resultado: autorizacion.contingencia ? ('CONTINGENCIA' as const) : ('AUTORIZADO' as const),
      motivo: autorizacion.contingencia ? autorizacion.detalle : undefined,
      selloTiempo: horaIngreso,
      ficha: await this.ficha(visitaId),
    };
  }

  /** Con huella, la plantilla viaja a los terminales (HU-09). Con credencial, recepción abre con el control de acceso general. */
  private async autorizarAcceso(visita: VisitaCompleta, metodo: MetodoId | null, horaIngreso: Date, usuario: UsuarioAutenticado): Promise<{ contingencia: boolean; detalle: string; referenciaAcs?: string }> {
    if (metodo === MetodoId.HUELLA) {
      const carga = await this.terminales.autorizarVisita(visita, horaIngreso, usuario);
      if (!carga.sinTerminales) return carga;
    }
    await this.prisma.visita.update({ where: { id: visita.id }, data: { ingresoFisicoEn: horaIngreso } });
    return this.acs.autorizarPaso(visita, usuario.nombre, usuario.id);
  }

  /** Recepción confirma que habilitó el paso manualmente (R3b). Idempotente. */
  async contingencia(visitaId: string, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.cargar(visitaId);
    if (visita.estado !== EstadoVisita.EN_PLANTA || !visita.modoContingencia) {
      throw new ConflictException({ codigo: 'SIN_CONTINGENCIA', mensaje: 'La visita no tiene un ingreso en modo de contingencia' });
    }
    const previo = await this.pasoManual(visitaId);
    if (previo.pasoManualEn) return previo;
    const selloTiempo = new Date();
    // D8: en contingencia, el paso manual cuenta como entrada para la lista de presentes
    await this.prisma.visita.updateMany({ where: { id: visitaId, ingresoFisicoEn: null }, data: { ingresoFisicoEn: selloTiempo } });
    this.eventos.publicar(Eventos.ACS_CONTINGENCIA, {
      tipo: TipoEvento.ACS_CONTINGENCIA,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'visita',
      entidadId: visitaId,
      resultado: 'paso habilitado manualmente por recepción',
      detalle: { pasoManual: true, selloTiempo: selloTiempo.toISOString() },
      ip,
    });
    return { pasoManualEn: selloTiempo };
  }

  /** Excepción autorizada, limitada a la visita (HU-19, R5). Devuelve la visita a R2. */
  async registrarExcepcion(visitaId: string, dto: RegistrarExcepcionDto, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.cargar(visitaId);
    if (visita.estado !== EstadoVisita.BLOQUEADA && visita.estado !== EstadoVisita.PRE_REGISTRADA) {
      throw new ConflictException({ codigo: 'VISITA_NO_ACTIVA', mensaje: 'La visita no admite una excepción en su estado actual' });
    }
    const publico = this.visitantes.descifrar(visita.visitante);
    const coincidencia = await this.restricciones.verificar(publico.numeroDocumento);
    if (!coincidencia) {
      throw new ConflictException({ codigo: 'SIN_COINCIDENCIA', mensaje: 'El visitante no tiene una coincidencia vigente en la lista de restricción' });
    }
    if (visita.excepcion?.entradaRestriccionId === coincidencia.id && visita.excepcion.vigenteHasta > new Date()) {
      throw new ConflictException({ codigo: 'EXCEPCION_EXISTENTE', mensaje: 'Esta visita ya tiene una excepción registrada' });
    }
    const excepcion = await this.prisma.$transaction(async (tx) => {
      const datos = {
        entradaRestriccionId: coincidencia.id,
        justificacion: dto.justificacion.trim(),
        autorizadoPor: dto.autorizadoPor.trim(),
        registradoPorId: usuario.id,
        fecha: new Date(),
        vigenteHasta: await this.finDeVisita(visita),
      };
      const creada = await tx.excepcionAutorizada.upsert({ where: { visitaId }, create: { visitaId, ...datos }, update: datos });
      await tx.visita.update({ where: { id: visitaId }, data: { estado: EstadoVisita.PRE_REGISTRADA } });
      return creada;
    });
    const evento: EventoExcepcionRegistrada = {
      tipo: TipoEvento.EXCEPCION_REGISTRADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'excepcion',
      entidadId: excepcion.id,
      resultado: 'excepción autorizada para esta visita',
      // La justificación es texto libre y puede contener datos personales: queda solo en su tabla
      detalle: { entradaRestriccionId: coincidencia.id, autorizadoPor: excepcion.autorizadoPor, vigenteHasta: excepcion.vigenteHasta.toISOString() },
      ip,
      nombreVisitante: publico.nombreCompleto,
      empresa: publico.empresa,
      justificacion: excepcion.justificacion,
      autorizadoPor: excepcion.autorizadoPor,
      operador: usuario.nombre,
    };
    this.eventos.publicar(Eventos.EXCEPCION_REGISTRADA, evento);
    return this.ficha(visitaId);
  }

  /** Registro exprés (HU-11): visita del día con consentimiento en recepción y credencial. */
  async expres(dto: RegistroExpresDto, usuario: UsuarioAutenticado, contexto: { ip?: string; userAgent?: string }) {
    const anfitrion = await this.prisma.usuarioInterno.findFirst({ where: { id: dto.anfitrionId, activo: true, rol: Rol.ANFITRION }, select: { id: true } });
    if (!anfitrion) {
      throw new UnprocessableEntityException({ codigo: 'ANFITRION_INVALIDO', mensaje: 'El anfitrión indicado no existe o no está activo' });
    }
    const [permanencia, versionPolitica] = await Promise.all([this.configuracion.numero('permanencia_default_min'), this.configuracion.texto('politica_version')]);
    const visitante = await this.visitantes.crearOActualizarExpres({
      nombreCompleto: dto.nombreCompleto,
      tipoDocumento: dto.tipoDocumento,
      numeroDocumento: dto.numeroDocumento,
      empresa: dto.empresa,
      correo: dto.correo,
    });
    const autorizaBiometria = dto.autorizaBiometria === true;
    const creada = await this.prisma.visita.create({
      data: {
        visitanteId: visitante.id,
        anfitrionId: anfitrion.id,
        estado: EstadoVisita.PRE_REGISTRADA,
        fechaProgramada: new Date(),
        motivo: dto.motivo.trim(),
        tiempoAutorizadoMin: dto.tiempoAutorizadoMin ?? permanencia,
        esExpres: true,
        consentimiento: {
          create: {
            versionPolitica,
            aceptaTratamiento: dto.aceptaTratamiento,
            aceptaNda: dto.aceptaNda,
            autorizaBiometria,
            versionTextoBiometrico: autorizaBiometria ? versionPolitica : null,
            ip: contexto.ip,
            userAgent: contexto.userAgent,
          },
        },
      },
    });
    // Con huella autorizada, recepción la enrola en el mismo acto (HU-11)
    const credencial = autorizaBiometria ? null : (await this.credenciales.generar(creada, usuario.nombre, usuario.id)).credencial;

    this.eventos.publicar(Eventos.REGISTRO_EXPRES, {
      tipo: TipoEvento.REGISTRO_EXPRES,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId: creada.id,
      entidad: 'visita',
      entidadId: creada.id,
      resultado: 'visita creada en recepción',
      // Sin CREDENCIAL_EMITIDA: ese evento envía el QR por correo y aquí recepción continúa en pantalla
      detalle: { anfitrionId: anfitrion.id, autorizaBiometria, credencialId: credencial?.id ?? null, credencialVenceEn: credencial?.venceEn.toISOString() ?? null },
      ip: contexto.ip,
    });
    this.eventos.publicar(Eventos.CONSENTIMIENTO_ACEPTADO, {
      tipo: TipoEvento.CONSENTIMIENTO_ACEPTADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId: creada.id,
      entidad: 'consentimiento',
      resultado: `política ${versionPolitica} y NDA aceptados en recepción; biometría ${autorizaBiometria ? 'autorizada' : 'no autorizada'}`,
      detalle: { autorizaBiometria },
      ip: contexto.ip,
    });

    // La verificación de restricción es obligatoria: se avisa aunque el operador abandone el flujo
    const coincidencia = await this.restricciones.verificar(dto.numeroDocumento);
    if (coincidencia) {
      const visita = await this.cargar(creada.id);
      await this.bloquear(visita, this.visitantes.descifrar(visita.visitante), coincidencia, usuario, contexto.ip);
      return { resultado: 'BLOQUEADO' as const, motivo: coincidencia.motivo, fechaRegistro: coincidencia.fechaRegistro, ficha: await this.ficha(creada.id) };
    }
    return { resultado: 'CREADA' as const, ficha: await this.ficha(creada.id) };
  }

  /**
   * Credencial alternativa al momento (HU-40, RNF-12): para quien autorizó la huella
   * pero no puede o no quiere usarla. Ningún ingreso depende solo de la biometría. Las
   * validaciones siguen siendo las de siempre, y recepción confirma el documento al autorizar.
   */
  async emitirCredencialAlternativa(visitaId: string, dto: EmitirCredencialAlternativaDto, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.cargar(visitaId);
    if (visita.estado !== EstadoVisita.PRE_REGISTRADA && visita.estado !== EstadoVisita.BLOQUEADA) {
      throw new ConflictException({ codigo: 'VISITA_NO_ACTIVA', mensaje: 'La visita no admite una credencial en su estado actual' });
    }
    const { credencial } = await this.credenciales.generar(visita, usuario.nombre, usuario.id);
    this.eventos.publicar(Eventos.CREDENCIAL_ALTERNATIVA, {
      tipo: TipoEvento.CREDENCIAL_EMITIDA,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'credencial',
      entidadId: credencial.id,
      resultado: 'credencial alternativa emitida en recepción',
      detalle: { motivo: dto.motivo, venceEn: credencial.venceEn.toISOString() },
      ip,
    });
    return this.ficha(visitaId);
  }

  /** Inducción presencial en la tableta de recepción (sección 7.4). */
  async induccionParaVisita(visitaId: string) {
    const visita = await this.cargar(visitaId);
    const [vigente, puntajeMinimo] = await Promise.all([this.induccion.vigente(visita.visitanteId), this.configuracion.numero('induccion_puntaje_minimo')]);
    return { vigente: Boolean(vigente), puntajeMinimo, preguntas: vigente ? [] : await this.induccion.preguntas() };
  }

  async evaluarInduccion(visitaId: string, respuestas: RespuestaInduccion[], ip?: string) {
    const visita = await this.cargar(visitaId);
    this.exigirConfirmable(visita.estado);
    return this.induccion.evaluar(visita.visitanteId, visita.id, respuestas, ip);
  }

  /** Opciones de los formularios de la consola; recepción no tiene acceso a la gestión de usuarios. */
  async catalogos() {
    const [usuarios, zonas] = await Promise.all([
      this.prisma.usuarioInterno.findMany({
        where: { activo: true, rol: { in: [Rol.ANFITRION, Rol.JEFE_SEGURIDAD] } },
        select: { id: true, nombre: true, area: true, rol: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.zona.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
    ]);
    const quitarRol = ({ id, nombre, area }: (typeof usuarios)[number]) => ({ id, nombre, area });
    return { anfitriones: usuarios.filter((u) => u.rol === Rol.ANFITRION).map(quitarRol), acompanantes: usuarios.map(quitarRol), zonas };
  }

  // ---------------------------------------------------------------

  private async cargar(visitaId: string): Promise<VisitaCompleta> {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId }, include: INCLUIR });
    if (!visita) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    return visita;
  }

  private exigirConfirmable(estado: EstadoVisita): void {
    if (estado === EstadoVisita.EN_PLANTA) {
      throw new ConflictException({ codigo: 'VISITA_YA_EN_PLANTA', mensaje: 'El visitante ya tiene un check-in activo' });
    }
    if (estado === EstadoVisita.FINALIZADA || estado === EstadoVisita.CANCELADA) {
      throw new ConflictException({ codigo: 'VISITA_NO_ACTIVA', mensaje: 'La visita ya finalizó o fue cancelada' });
    }
    if (estado === EstadoVisita.PROGRAMADA) {
      throw new ConflictException({ codigo: 'SIN_PRE_REGISTRO', mensaje: 'El visitante no ha completado el pre-registro. Use el enlace enviado o el registro exprés' });
    }
  }

  private async evaluar(visita: VisitaCompleta, publico: VisitantePublico): Promise<{ requisitos: Requisitos; coincidencia: Coincidencia | null }> {
    const documento = publico.numeroDocumento.trim();
    const [credencial, biometria, induccion, epp, coincidencia] = await Promise.all([
      this.credencialVigente(visita),
      this.biometria.identificacion(visita),
      this.induccion.vigente(visita.visitanteId),
      this.epp.estado(visita.id),
      documento && !publico.anonimizado ? this.restricciones.verificar(documento) : Promise.resolve(null),
    ]);
    const excepcionValida =
      coincidencia && visita.excepcion?.entradaRestriccionId === coincidencia.id && visita.excepcion.vigenteHasta > new Date() ? visita.excepcion : null;
    const restriccion: Requisitos['restriccion'] = !coincidencia
      ? { estado: 'SIN_COINCIDENCIA' }
      : excepcionValida
        ? { estado: 'EXCEPCION', motivo: coincidencia.motivo, fechaRegistro: coincidencia.fechaRegistro, autorizadoPor: excepcionValida.autorizadoPor }
        : { estado: 'COINCIDENCIA', motivo: coincidencia.motivo, fechaRegistro: coincidencia.fechaRegistro };
    const autorizaBiometria = visita.consentimiento?.autorizaBiometria ?? false;
    const antesMin = await this.configuracion.numero('qr_margen_antes_min');
    const enVentana = visita.fechaProgramada.getTime() - antesMin * 60_000 <= Date.now();
    const metodo = autorizaBiometria && biometria.identificada && enVentana ? MetodoId.HUELLA : credencial.vigente ? MetodoId.CREDENCIAL_ALTERNATIVA : null;
    return {
      coincidencia,
      requisitos: {
        credencial,
        identificacion: { metodo, autorizaBiometria, enrolada: biometria.enrolada },
        induccion: { vigente: Boolean(induccion), venceEn: induccion?.venceEn ?? null },
        restriccion,
        epp,
        completos: metodo !== null && Boolean(induccion) && restriccion.estado !== 'COINCIDENCIA' && epp.completo,
      },
    };
  }

  /** Mismos criterios de vigencia que el QR: la búsqueda manual no debe saltárselos. */
  private async credencialVigente(visita: VisitaCompleta): Promise<Requisitos['credencial']> {
    const credencial = visita.credencial;
    if (!credencial?.activa) return { vigente: false, venceEn: null };
    const antesMin = await this.configuracion.numero('qr_margen_antes_min');
    const ahora = Date.now();
    const vigente = credencial.venceEn.getTime() > ahora && visita.fechaProgramada.getTime() - antesMin * 60_000 <= ahora;
    return { vigente, venceEn: credencial.venceEn };
  }

  private motivoRequisitos(r: Requisitos): string {
    const faltantes = [
      ...(r.identificacion.metodo ? [] : [r.identificacion.autorizaBiometria ? 'falta identificar al visitante con su huella o la credencial alternativa' : 'la credencial no está vigente']),
      ...(r.induccion.vigente ? [] : ['falta la inducción vigente']),
      ...(r.epp.completo ? [] : [`falta EPP: ${r.epp.faltantes.map((e) => NOMBRE_EPP[e]).join(', ')}`]),
    ];
    return `No se permite el ingreso: ${faltantes.join('; ')}`;
  }

  /** Marca la visita como bloqueada y avisa una sola vez, aunque recepción reintente (HU-18, HU-20). */
  private async bloquear(visita: VisitaCompleta, publico: VisitantePublico, coincidencia: Coincidencia, usuario: UsuarioAutenticado, ip?: string): Promise<void> {
    const { count } = await this.prisma.visita.updateMany({
      where: { id: visita.id, estado: EstadoVisita.PRE_REGISTRADA },
      data: { estado: EstadoVisita.BLOQUEADA },
    });
    if (count === 0) return;
    const evento: EventoCheckInBloqueado = {
      tipo: TipoEvento.CHECKIN_BLOQUEADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId: visita.id,
      entidad: 'restriccion',
      entidadId: coincidencia.id,
      resultado: 'ingreso bloqueado antes de contactar al ACS',
      detalle: { entradaRestriccionId: coincidencia.id },
      ip,
      nombreVisitante: publico.nombreCompleto,
      empresa: publico.empresa,
      motivoRestriccion: coincidencia.motivo,
      operador: usuario.nombre,
    };
    this.eventos.publicar(Eventos.CHECKIN_BLOQUEADO, evento);
  }

  private async exigirDatosOpcionales(dto: ConfirmarCheckInDto): Promise<void> {
    if (dto.acompananteId) {
      const acompanante = await this.prisma.usuarioInterno.findFirst({ where: { id: dto.acompananteId, activo: true }, select: { id: true } });
      if (!acompanante) throw new UnprocessableEntityException({ codigo: 'ACOMPANANTE_INVALIDO', mensaje: 'El acompañante indicado no existe o no está activo' });
    }
    if (dto.zonaId) {
      const zona = await this.prisma.zona.findFirst({ where: { id: dto.zonaId, activa: true } });
      if (!zona) throw new UnprocessableEntityException({ codigo: 'ZONA_INVALIDA', mensaje: 'La zona indicada no existe o está inactiva' });
      if (zona.requiereAcompanante && !dto.acompananteId) {
        throw new UnprocessableEntityException({ codigo: 'REQUIERE_ACOMPANANTE', mensaje: `La zona ${zona.nombre} exige un acompañante` });
      }
    }
  }

  private async exigirNoPresente(visitanteId: string, visitaId: string): Promise<void> {
    const otra = await this.prisma.visita.findFirst({ where: { visitanteId, estado: EstadoVisita.EN_PLANTA, id: { not: visitaId } }, select: { id: true } });
    if (otra) {
      throw new ConflictException({ codigo: 'VISITANTE_YA_EN_PLANTA', mensaje: 'Este visitante ya tiene otra visita en planta. Registre primero su salida', detalles: { visitaId: otra.id } });
    }
  }

  private async reclamarIngreso(visita: VisitaCompleta, dto: ConfirmarCheckInDto, horaIngreso: Date, usuario: UsuarioAutenticado, metodoIdentificacion: MetodoId | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.visita.updateMany({
        where: { id: visita.id, estado: { in: [EstadoVisita.PRE_REGISTRADA, EstadoVisita.BLOQUEADA] } },
        data: { estado: EstadoVisita.EN_PLANTA, horaIngreso, identidadVerificada: true, metodoIdentificacion, ...(dto.acompananteId ? { acompananteId: dto.acompananteId } : {}) },
      });
      if (count === 0) {
        throw new ConflictException({ codigo: 'VISITA_YA_EN_PLANTA', mensaje: 'El visitante ya tiene un check-in activo' });
      }
      await tx.credencialQr.updateMany({ where: { visitaId: visita.id }, data: { fisicaEntregada: true } });
      if (dto.vehiculo) {
        const datos = { placa: dto.vehiculo.placa.trim().toUpperCase(), tipo: dto.vehiculo.tipo?.trim() || null };
        await tx.vehiculo.upsert({ where: { visitaId: visita.id }, create: { visitaId: visita.id, ...datos }, update: datos });
      }
      if (!dto.zonaId) return null;
      await tx.visitaZona.upsert({ where: { visitaId_zonaId: { visitaId: visita.id, zonaId: dto.zonaId } }, create: { visitaId: visita.id, zonaId: dto.zonaId }, update: {} });
      const movimiento = await tx.movimientoZona.create({ data: { visitaId: visita.id, zonaId: dto.zonaId, horaEntrada: horaIngreso, registradoPorId: usuario.id } });
      return movimiento.id;
    });
  }

  private publicarDatosOpcionales(visitaId: string, dto: ConfirmarCheckInDto, movimientoId: string | null, usuario: UsuarioAutenticado, ip?: string): void {
    const base = { actor: usuario.nombre, actorId: usuario.id, visitaId, ip };
    if (dto.acompananteId) {
      this.eventos.publicar(Eventos.ACOMPANANTE_ASIGNADO, { ...base, tipo: TipoEvento.ACOMPANANTE_ASIGNADO, entidad: 'usuario', entidadId: dto.acompananteId, resultado: 'acompañante asignado en el check-in' });
    }
    if (dto.vehiculo) {
      // La placa identifica a una persona: no se escribe en la bitácora
      this.eventos.publicar(Eventos.VEHICULO_REGISTRADO, { ...base, tipo: TipoEvento.VEHICULO_REGISTRADO, entidad: 'vehiculo', resultado: 'vehículo registrado en el check-in' });
    }
    if (movimientoId) {
      this.eventos.publicar(Eventos.MOVIMIENTO_ZONA, { ...base, tipo: TipoEvento.MOVIMIENTO_ZONA, entidad: 'movimiento_zona', entidadId: movimientoId, resultado: 'entrada a zona en el check-in', detalle: { zonaId: dto.zonaId } });
    }
  }

  private async revertirIngreso(visita: VisitaCompleta, movimientoId: string | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.visita.update({
        where: { id: visita.id },
        data: { estado: visita.estado, horaIngreso: null, identidadVerificada: visita.identidadVerificada, acompananteId: visita.acompananteId },
      }),
      ...(movimientoId ? [this.prisma.movimientoZona.delete({ where: { id: movimientoId } })] : []),
      this.prisma.credencialQr.updateMany({ where: { visitaId: visita.id }, data: { fisicaEntregada: false } }),
      visita.vehiculo
        ? this.prisma.vehiculo.update({ where: { visitaId: visita.id }, data: { placa: visita.vehiculo.placa, tipo: visita.vehiculo.tipo } })
        : this.prisma.vehiculo.deleteMany({ where: { visitaId: visita.id } }),
    ]);
  }

  private async finDeVisita(visita: VisitaCompleta): Promise<Date> {
    if (visita.credencial?.activa) return visita.credencial.venceEn;
    const despuesMin = await this.configuracion.numero('qr_margen_despues_min');
    return new Date(visita.fechaProgramada.getTime() + (visita.tiempoAutorizadoMin + despuesMin) * 60_000);
  }

  private async pasoManual(visitaId: string): Promise<{ pasoManualEn: Date | null }> {
    const evento = await this.prisma.eventoBitacora.findFirst({
      where: { visitaId, tipoEvento: TipoEvento.ACS_CONTINGENCIA, detalle: { path: ['pasoManual'], equals: true } },
      orderBy: { fechaHora: 'asc' },
      select: { fechaHora: true },
    });
    return { pasoManualEn: evento?.fechaHora ?? null };
  }
}
