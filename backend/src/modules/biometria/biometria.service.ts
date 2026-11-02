import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { Dedo, EstadoVisita, ResultadoCotejo, TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { diaBogota, finDia, inicioDia } from '../reportes-kpi/fechas.js';
import type { IdentificarHuellaDto, MuestraHuellaDto } from './dto/biometria.dto.js';
import { MOTOR_COTEJO, type IMotorCotejo } from './motor-cotejo.js';

const DEDOS_REQUERIDOS = 2;
/** Una identificación vale para un solo trámite en recepción: evita autorizar con un cotejo antiguo. */
const VIGENCIA_IDENTIFICACION_MS = 10 * 60_000;
const ORIGEN_RECEPCION = 'RECEPCION';

/**
 * Módulo de biometría (HU-37): enrola plantillas cifradas. Ninguna operación
 * devuelve ni registra una plantilla (RNF-07 y RNF-09).
 */
@Injectable()
export class BiometriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
    @Inject(MOTOR_COTEJO) private readonly motor: IMotorCotejo,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** El motor simulado acepta cualquier identificador de prueba: en producción, eso abriría el paso a cualquiera. */
  private exigirMotorReal(): void {
    if (this.motor.formato === 'SIMULADO' && this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new ServiceUnavailableException({ codigo: 'BIOMETRIA_NO_DISPONIBLE', mensaje: 'La identificación por huella no está disponible. Use la credencial alternativa' });
    }
  }

  /** Lo que la consola necesita para guiar el enrolamiento, sin datos de las plantillas. */
  async estado(visitaId: string) {
    const visita = await this.cargar(visitaId);
    const [muestrasPorDedo, calidadMinima, plantillas] = await Promise.all([
      this.configuracion.numero('biometria_muestras_por_dedo'),
      this.configuracion.numero('biometria_calidad_minima'),
      this.prisma.plantillaBiometrica.findMany({
        where: { visitanteId: visita.visitanteId, revocadaEn: null, venceEn: { gt: new Date() } },
        select: { dedo: true, calidad: true, fechaEnrolamiento: true, venceEn: true },
      }),
    ]);
    return {
      autorizaBiometria: visita.consentimiento?.autorizaBiometria ?? false,
      estadoVisita: visita.estado,
      dedosRequeridos: DEDOS_REQUERIDOS,
      muestrasPorDedo,
      calidadMinima,
      plantillas,
    };
  }

  async enrolar(visitaId: string, muestras: MuestraHuellaDto[], usuario: UsuarioAutenticado, ip?: string) {
    this.exigirMotorReal();
    const visita = await this.cargar(visitaId);
    if (!visita.consentimiento?.autorizaBiometria) {
      throw new ConflictException({ codigo: 'SIN_AUTORIZACION_BIOMETRICA', mensaje: 'El visitante no autorizó el tratamiento de su huella. Use la credencial alternativa' });
    }
    if (visita.estado !== EstadoVisita.PRE_REGISTRADA) {
      throw new ConflictException({ codigo: 'VISITA_NO_ENROLABLE', mensaje: 'Solo se enrola la huella de una visita con pre-registro completo y sin ingreso' });
    }

    const mejores = await this.validarMuestras(muestras);
    await this.exigirNoDuplicada(visita.visitante.numeroDocumentoHash, mejores);

    const meses = await this.configuracion.numero('biometria_retencion_meses');
    const venceEn = new Date();
    venceEn.setMonth(venceEn.getMonth() + meses);
    await this.prisma.$transaction(async (tx) => {
      await tx.visita.update({ where: { id: visitaId }, data: { identidadVerificada: true } });
      // Un enrolamiento nuevo reemplaza por completo al anterior: máximo dos dedos (Figura 13)
      await tx.plantillaBiometrica.deleteMany({ where: { visitanteId: visita.visitanteId } });
      await tx.plantillaBiometrica.createMany({
        data: mejores.map((m) => ({
          visitanteId: visita.visitanteId,
          dedo: m.dedo,
          formato: m.formato,
          datoCifrado: this.crypto.cifrar(m.plantilla),
          calidad: m.calidad,
          venceEn,
        })),
      });
    });

    const dedos = mejores.map((m) => m.dedo);
    this.eventos.publicar(Eventos.HUELLA_ENROLADA, {
      tipo: TipoEvento.HUELLA_ENROLADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'visitante',
      entidadId: visita.visitanteId,
      resultado: `${dedos.length} dedos enrolados`,
      detalle: { dedos, formato: this.motor.formato },
      ip,
    });
    return { dedos, venceEn };
  }

  /**
   * Identificación 1:N (HU-07, sección 7.3): solo contra quienes tienen visita hoy
   * y autorizaron la huella. Es una galería reducida: acelera el cotejo y limita el
   * tratamiento del dato. No autoriza nada: el check-in valida después los requisitos.
   */
  async identificar(dto: IdentificarHuellaDto, usuario: UsuarioAutenticado, ip?: string) {
    this.exigirMotorReal();
    const [intentosMaximos, calidadMinima] = await Promise.all([this.configuracion.numero('biometria_intentos'), this.configuracion.numero('biometria_calidad_minima')]);
    const rechazo = dto.motivo ?? (dto.pruebaVida === false ? 'PRUEBA_VIDA_FALLIDA' : (dto.calidad ?? 0) < calidadMinima ? 'CALIDAD_BAJA' : null);
    if (rechazo) {
      await this.registrarCotejo(rechazo === 'CALIDAD_BAJA' ? ResultadoCotejo.CALIDAD_BAJA : ResultadoCotejo.PRUEBA_VIDA_FALLIDA, null, null, rechazo !== 'PRUEBA_VIDA_FALLIDA', usuario, ip);
      return { resultado: rechazo, intentosMaximos };
    }

    const coincidencia = await this.buscarEnGaleria(dto.formato ?? '', dto.plantilla ?? '');
    if (!coincidencia) {
      await this.registrarCotejo(ResultadoCotejo.NO_COINCIDE, null, null, true, usuario, ip);
      return { resultado: ResultadoCotejo.NO_COINCIDE, intentosMaximos };
    }
    await this.registrarCotejo(ResultadoCotejo.COINCIDE, coincidencia.visitaId, coincidencia.puntaje, true, usuario, ip);
    return { resultado: ResultadoCotejo.COINCIDE, visitaId: coincidencia.visitaId, intentosMaximos };
  }

  /** Lo que el check-in necesita saber, sin datos de las plantillas. */
  async identificacion(visita: { id: string; visitanteId: string; identidadVerificada: boolean }) {
    const desde = new Date(Date.now() - VIGENCIA_IDENTIFICACION_MS);
    const [plantillas, cotejo] = await Promise.all([
      this.prisma.plantillaBiometrica.findMany({ where: { visitanteId: visita.visitanteId, revocadaEn: null, venceEn: { gt: new Date() } }, select: { fechaEnrolamiento: true } }),
      this.prisma.eventoCotejo.findFirst({ where: { visitaId: visita.id, resultado: ResultadoCotejo.COINCIDE, fechaHora: { gte: desde } }, select: { id: true } }),
    ]);
    // En la primera visita, enrolar tras confirmar el documento ya identifica a la persona (Figura 16)
    const recienEnrolada = visita.identidadVerificada && plantillas.some((p) => p.fechaEnrolamiento >= desde);
    return { enrolada: plantillas.length > 0, identificada: plantillas.length > 0 && (Boolean(cotejo) || recienEnrolada) };
  }

  /** La retención cuenta desde la última visita: cada ingreso con huella la renueva (HU-39). */
  async renovarVigencia(visitanteId: string): Promise<void> {
    const meses = await this.configuracion.numero('biometria_retencion_meses');
    const venceEn = new Date();
    venceEn.setMonth(venceEn.getMonth() + meses);
    await this.prisma.plantillaBiometrica.updateMany({ where: { visitanteId, revocadaEn: null }, data: { venceEn } });
  }

  // ---------------------------------------------------------------

  private async buscarEnGaleria(formato: string, plantilla: string): Promise<{ visitaId: string; puntaje: number } | null> {
    if (formato !== this.motor.formato) {
      throw new UnprocessableEntityException({ codigo: 'FORMATO_NO_SOPORTADO', mensaje: 'El formato de la plantilla no es compatible con el motor de cotejo' });
    }
    const hoy = diaBogota(new Date());
    const visitas = await this.prisma.visita.findMany({
      where: {
        estado: { in: [EstadoVisita.PRE_REGISTRADA, EstadoVisita.BLOQUEADA] },
        fechaProgramada: { gte: inicioDia(hoy), lte: finDia(hoy) },
        consentimiento: { autorizaBiometria: true },
        visitante: { anonimizado: false, plantillas: { some: { formato: this.motor.formato, revocadaEn: null, venceEn: { gt: new Date() } } } },
      },
      orderBy: { fechaProgramada: 'asc' },
      select: { id: true, visitante: { select: { plantillas: { where: { formato: this.motor.formato, revocadaEn: null, venceEn: { gt: new Date() } }, select: { datoCifrado: true } } } } },
    });
    const umbral = this.motor.umbral();
    let mejor: { visitaId: string; puntaje: number } | null = null;
    for (const visita of visitas) {
      for (const { datoCifrado } of visita.visitante.plantillas) {
        const puntaje = this.motor.comparar(plantilla, this.crypto.descifrar(datoCifrado));
        if (puntaje >= umbral && (!mejor || puntaje > mejor.puntaje)) mejor = { visitaId: visita.id, puntaje };
      }
    }
    return mejor;
  }

  private async registrarCotejo(resultado: ResultadoCotejo, visitaId: string | null, puntaje: number | null, pruebaVida: boolean, usuario: UsuarioAutenticado, ip?: string): Promise<void> {
    const cotejo = await this.prisma.eventoCotejo.create({ data: { resultado, visitaId, puntaje, pruebaVida, origen: ORIGEN_RECEPCION } });
    const evento = resultado === ResultadoCotejo.COINCIDE
      ? { nombre: Eventos.COTEJO_EXITOSO, tipo: TipoEvento.COTEJO_EXITOSO }
      : resultado === ResultadoCotejo.PRUEBA_VIDA_FALLIDA
        ? { nombre: Eventos.PRUEBA_VIDA_FALLIDA, tipo: TipoEvento.PRUEBA_VIDA_FALLIDA }
        : { nombre: Eventos.COTEJO_FALLIDO, tipo: TipoEvento.COTEJO_FALLIDO };
    this.eventos.publicar(evento.nombre, {
      tipo: evento.tipo,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'evento_cotejo',
      entidadId: cotejo.id,
      resultado: resultado.toLowerCase(),
      detalle: { resultado, formato: this.motor.formato },
      ip,
    });
  }

  private async cargar(visitaId: string) {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId }, include: { consentimiento: true, visitante: { select: { numeroDocumentoHash: true } } } });
    if (!visita) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    return visita;
  }

  /** Dos dedos, el número configurado de muestras por dedo, vida y calidad. Devuelve la mejor muestra de cada dedo. */
  private async validarMuestras(muestras: MuestraHuellaDto[]): Promise<MuestraHuellaDto[]> {
    const [muestrasPorDedo, calidadMinima] = await Promise.all([this.configuracion.numero('biometria_muestras_por_dedo'), this.configuracion.numero('biometria_calidad_minima')]);
    const porDedo = new Map<Dedo, MuestraHuellaDto[]>();
    for (const muestra of muestras) porDedo.set(muestra.dedo, [...(porDedo.get(muestra.dedo) ?? []), muestra]);
    if (porDedo.size !== DEDOS_REQUERIDOS || [...porDedo.values()].some((lista) => lista.length !== muestrasPorDedo)) {
      throw new UnprocessableEntityException({ codigo: 'MUESTRAS_INCOMPLETAS', mensaje: `Se requieren ${DEDOS_REQUERIDOS} dedos con ${muestrasPorDedo} muestras cada uno` });
    }
    if (muestras.some((m) => m.formato !== this.motor.formato)) {
      throw new UnprocessableEntityException({ codigo: 'FORMATO_NO_SOPORTADO', mensaje: 'El formato de la plantilla no es compatible con el motor de cotejo' });
    }
    if (muestras.some((m) => !m.pruebaVida)) {
      throw new UnprocessableEntityException({ codigo: 'PRUEBA_VIDA_FALLIDA', mensaje: 'Una muestra no superó la prueba de vida' });
    }
    if (muestras.some((m) => m.calidad < calidadMinima)) {
      throw new UnprocessableEntityException({ codigo: 'CALIDAD_BAJA', mensaje: `Una muestra no alcanza la calidad mínima de ${calidadMinima}` });
    }
    return [...porDedo.values()].map((lista) => {
      const mejor = lista.reduce((a, b) => (b.calidad > a.calidad ? b : a));
      if (lista.some((m) => this.motor.comparar(m.plantilla, mejor.plantilla) < this.motor.umbral())) {
        throw new UnprocessableEntityException({ codigo: 'MUESTRAS_INCONSISTENTES', mensaje: 'Las muestras de un mismo dedo no coinciden entre sí. Repita la captura' });
      }
      return mejor;
    });
  }

  /** Una misma huella en dos personas haría ambigua la identificación 1:N. */
  private async exigirNoDuplicada(numeroDocumentoHash: string, muestras: MuestraHuellaDto[]): Promise<void> {
    const otras = await this.prisma.plantillaBiometrica.findMany({
      where: { formato: this.motor.formato, revocadaEn: null, venceEn: { gt: new Date() }, visitante: { numeroDocumentoHash: { not: numeroDocumentoHash } } },
      select: { datoCifrado: true },
    });
    const umbral = this.motor.umbral();
    for (const { datoCifrado } of otras) {
      const plantilla = this.crypto.descifrar(datoCifrado);
      if (muestras.some((m) => this.motor.comparar(m.plantilla, plantilla) >= umbral)) {
        throw new ConflictException({ codigo: 'HUELLA_DUPLICADA', mensaje: 'Esta huella ya está registrada para otra persona. Verifique la identidad o use la credencial alternativa' });
      }
    }
  }
}
