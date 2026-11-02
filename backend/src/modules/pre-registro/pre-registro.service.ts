import { ConflictException, GoneException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import type { EventoCredencialEmitida } from '../../eventos/payloads.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { EstadoVisita, TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { CredencialesService } from '../credenciales/credenciales.service.js';
import { InduccionService, type RespuestaInduccion } from '../seguridad-industrial/induccion.service.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';
import type { ConsentimientoDto, DatosPreRegistroDto } from './dto/pre-registro.dto.js';

export type PasoPreRegistro = 'DATOS' | 'CONSENTIMIENTO' | 'INDUCCION' | 'CREDENCIAL' | 'HUELLA';

const INCLUIR = {
  visitante: true,
  anfitrion: { select: { nombre: true, area: true } },
  consentimiento: true,
  credencial: true,
} satisfies Prisma.VisitaInclude;

interface Contexto {
  ip?: string;
  userAgent?: string;
}

/**
 * Portal del visitante (CU-01): asistente de tres pasos accesible por enlace
 * con token. Regla central: no se emite credencial sin consentimiento
 * registrado (HU-04) ni inducción aprobada y vigente (HU-32).
 */
@Injectable()
export class PreRegistroService {
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly visitantes: VisitantesService,
    private readonly induccion: InduccionService,
    private readonly credenciales: CredencialesService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
    config: ConfigService<Env, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true }).replace(/\/$/, '');
  }

  /** Estado completo del asistente para el token (V1 a V7). */
  async estado(token: string) {
    const visita = await this.visitaPorToken(token);
    const publico = this.visitantes.descifrar(visita.visitante);
    const [induccionVigente, politicaVersion, visitasPrevias, plantillas] = await Promise.all([
      this.induccion.vigente(visita.visitanteId),
      this.configuracion.texto('politica_version'),
      this.prisma.visita.count({ where: { visitanteId: visita.visitanteId, estado: EstadoVisita.FINALIZADA } }),
      this.prisma.plantillaBiometrica.count({ where: { visitanteId: visita.visitanteId, revocadaEn: null, venceEn: { gt: new Date() } } }),
    ]);
    const datosCompletos = publico.numeroDocumento.trim().length > 0;
    const credencialActiva = visita.credencial?.activa ?? false;
    const paso: PasoPreRegistro = credencialActiva
      ? 'CREDENCIAL'
      : visita.estado === EstadoVisita.PRE_REGISTRADA && visita.consentimiento?.autorizaBiometria
        ? 'HUELLA'
        : !datosCompletos
          ? 'DATOS'
          : !visita.consentimiento
            ? 'CONSENTIMIENTO'
            : 'INDUCCION';

    return {
      paso,
      visita: {
        id: visita.id,
        estado: visita.estado,
        fechaProgramada: visita.fechaProgramada,
        motivo: visita.motivo,
        tiempoAutorizadoMin: visita.tiempoAutorizadoMin,
        vencimientoEnlace: visita.vencimientoEnlace,
      },
      anfitrion: visita.anfitrion,
      visitante: {
        nombreCompleto: publico.nombreCompleto,
        tipoDocumento: publico.tipoDocumento,
        numeroDocumento: publico.numeroDocumento,
        empresa: publico.empresa,
        correo: publico.correo,
        telefono: publico.telefono,
      },
      esRecurrente: visitasPrevias > 0,
      consentimiento: visita.consentimiento
        ? { fechaHoraAceptacion: visita.consentimiento.fechaHoraAceptacion, versionPolitica: visita.consentimiento.versionPolitica, autorizaBiometria: visita.consentimiento.autorizaBiometria }
        : null,
      politicaVersion,
      induccion: induccionVigente ? { vigente: true, puntaje: induccionVigente.puntaje, venceEn: induccionVigente.venceEn } : { vigente: false },
      credencial: credencialActiva && visita.credencial ? { venceEn: visita.credencial.venceEn } : null,
      huellaEnrolada: plantillas > 0,
    };
  }

  async guardarDatos(token: string, dto: DatosPreRegistroDto, ctx: Contexto) {
    const visita = await this.visitaPorToken(token);
    this.exigirEditable(visita.estado);
    await this.visitantes.actualizar(visita.visitanteId, dto);
    this.eventos.publicar(Eventos.PRE_REGISTRO_COMPLETADO, {
      tipo: TipoEvento.PRE_REGISTRO_DATOS,
      actor: 'Visitante',
      visitaId: visita.id,
      entidad: 'visitante',
      entidadId: visita.visitanteId,
      resultado: 'datos personales registrados',
      ip: ctx.ip,
    });
    return this.estado(token);
  }

  async registrarConsentimiento(token: string, dto: ConsentimientoDto, ctx: Contexto) {
    const visita = await this.visitaPorToken(token);
    this.exigirEditable(visita.estado);
    const versionPolitica = await this.configuracion.texto('politica_version');
    const autorizaBiometria = dto.autorizaBiometria === true;
    const biometria = { autorizaBiometria, versionTextoBiometrico: autorizaBiometria ? versionPolitica : null };
    await this.prisma.consentimiento.upsert({
      where: { visitaId: visita.id },
      update: { aceptaTratamiento: dto.aceptaTratamiento, aceptaNda: dto.aceptaNda, ...biometria, versionPolitica, fechaHoraAceptacion: new Date(), ip: ctx.ip, userAgent: ctx.userAgent },
      create: { visitaId: visita.id, aceptaTratamiento: dto.aceptaTratamiento, aceptaNda: dto.aceptaNda, ...biometria, versionPolitica, ip: ctx.ip, userAgent: ctx.userAgent },
    });
    this.eventos.publicar(Eventos.CONSENTIMIENTO_ACEPTADO, {
      tipo: TipoEvento.CONSENTIMIENTO_ACEPTADO,
      actor: 'Visitante',
      visitaId: visita.id,
      entidad: 'consentimiento',
      resultado: `política ${versionPolitica} y NDA aceptados; biometría ${autorizaBiometria ? 'autorizada' : 'no autorizada'}`,
      detalle: { autorizaBiometria },
      ip: ctx.ip,
    });
    return this.estado(token);
  }

  async induccionParaToken(token: string) {
    const visita = await this.visitaPorToken(token);
    const vigente = await this.induccion.vigente(visita.visitanteId);
    const puntajeMinimo = await this.configuracion.numero('induccion_puntaje_minimo');
    if (vigente) {
      return { vigente: true as const, puntaje: vigente.puntaje, venceEn: vigente.venceEn, puntajeMinimo, preguntas: [] };
    }
    return { vigente: false as const, puntajeMinimo, preguntas: await this.induccion.preguntas() };
  }

  async evaluarInduccion(token: string, respuestas: RespuestaInduccion[], ctx: Contexto) {
    const visita = await this.visitaPorToken(token);
    this.exigirEditable(visita.estado);
    return this.induccion.evaluar(visita.visitanteId, visita.id, respuestas, ctx.ip);
  }

  /** Verifica los requisitos en el servidor y habilita la huella o emite la credencial alternativa (HU-05). */
  async finalizar(token: string, ctx: Contexto) {
    const visita = await this.visitaPorToken(token);
    this.exigirEditable(visita.estado);
    const publico = this.visitantes.descifrar(visita.visitante);
    if (!publico.numeroDocumento.trim()) {
      throw new UnprocessableEntityException({ codigo: 'DATOS_INCOMPLETOS', mensaje: 'Complete sus datos personales antes de continuar' });
    }
    if (!visita.consentimiento || !visita.consentimiento.aceptaTratamiento || !visita.consentimiento.aceptaNda) {
      throw new UnprocessableEntityException({ codigo: 'SIN_CONSENTIMIENTO', mensaje: 'No se genera la credencial sin la aceptación registrada del consentimiento y el NDA' });
    }
    const induccion = await this.induccion.vigente(visita.visitanteId);
    if (!induccion) {
      throw new UnprocessableEntityException({ codigo: 'SIN_INDUCCION', mensaje: 'Debe aprobar la inducción de seguridad antes de obtener la credencial' });
    }

    if (visita.consentimiento.autorizaBiometria) {
      await this.prisma.visita.update({ where: { id: visita.id }, data: { estado: EstadoVisita.PRE_REGISTRADA } });
      this.eventos.publicar(Eventos.PRE_REGISTRO_COMPLETADO, {
        tipo: TipoEvento.PRE_REGISTRO_COMPLETADO,
        actor: 'Visitante',
        visitaId: visita.id,
        resultado: 'pre-registro completado; pendiente de identificación por huella',
        ip: ctx.ip,
      });
      return { codigoQr: null, venceEn: null, estado: await this.estado(token) };
    }

    const { credencial, codigoQr } = await this.credenciales.generar(visita, 'Visitante');
    await this.prisma.visita.update({ where: { id: visita.id }, data: { estado: EstadoVisita.PRE_REGISTRADA } });

    this.eventos.publicar(Eventos.PRE_REGISTRO_COMPLETADO, {
      tipo: TipoEvento.PRE_REGISTRO_COMPLETADO,
      actor: 'Visitante',
      visitaId: visita.id,
      resultado: 'pre-registro completado; credencial emitida',
      ip: ctx.ip,
    });
    // Un solo evento: la bitácora lo registra y NotificacionesService envía el correo con el QR
    const evento: EventoCredencialEmitida = {
      tipo: TipoEvento.CREDENCIAL_EMITIDA,
      actor: 'Visitante',
      visitaId: visita.id,
      entidad: 'credencial',
      entidadId: credencial.id,
      resultado: `vigente hasta ${credencial.venceEn.toISOString()}`,
      destinatario: publico.correo,
      nombreVisitante: publico.nombreCompleto,
      empresa: publico.empresa,
      fechaVisita: visita.fechaProgramada,
      venceEn: credencial.venceEn,
      codigoQr,
      enlaceCredencial: `${this.frontendUrl}/pre-registro/${token}`,
    };
    this.eventos.publicar(Eventos.CREDENCIAL_EMITIDA, evento);

    return { codigoQr, venceEn: credencial.venceEn, estado: await this.estado(token) };
  }

  async credencial(token: string) {
    const visita = await this.visitaPorToken(token);
    const codigoQr = await this.credenciales.tokenDeVisita(visita);
    if (!codigoQr || !visita.credencial) {
      throw new NotFoundException({ codigo: 'SIN_CREDENCIAL', mensaje: 'Aún no se ha emitido la credencial de esta visita' });
    }
    const publico = this.visitantes.descifrar(visita.visitante);
    return {
      codigoQr,
      venceEn: visita.credencial.venceEn,
      visitante: { nombreCompleto: publico.nombreCompleto, empresa: publico.empresa },
      visita: { fechaProgramada: visita.fechaProgramada, motivo: visita.motivo, tiempoAutorizadoMin: visita.tiempoAutorizadoMin },
      anfitrion: visita.anfitrion,
    };
  }

  // ---------------------------------------------------------------

  private async visitaPorToken(token: string) {
    const visita = await this.prisma.visita.findUnique({ where: { tokenEnlaceHash: this.crypto.hashToken(token) }, include: INCLUIR });
    if (!visita) {
      throw new NotFoundException({ codigo: 'ENLACE_INVALIDO', mensaje: 'Este enlace no es válido. Contacte a su anfitrión' });
    }
    if (visita.estado === EstadoVisita.CANCELADA) {
      throw new GoneException({ codigo: 'VISITA_CANCELADA', mensaje: 'La visita fue cancelada. Contacte a su anfitrión' });
    }
    if (visita.vencimientoEnlace && visita.vencimientoEnlace < new Date()) {
      throw new GoneException({
        codigo: 'ENLACE_VENCIDO',
        mensaje: 'El enlace de pre-registro expiró. Pida a su anfitrión que lo reenvíe',
        detalles: { vencimientoEnlace: visita.vencimientoEnlace },
      });
    }
    return visita;
  }

  private exigirEditable(estado: EstadoVisita) {
    if (estado === EstadoVisita.EN_PLANTA || estado === EstadoVisita.FINALIZADA || estado === EstadoVisita.BLOQUEADA) {
      throw new ConflictException({ codigo: 'VISITA_NO_EDITABLE', mensaje: 'La visita ya está en curso o finalizó; el pre-registro no puede modificarse' });
    }
  }
}
