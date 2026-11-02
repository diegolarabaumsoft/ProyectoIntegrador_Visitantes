import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { EstadoVisita, MetodoId, TipoEvento } from '../../generated/prisma/enums.js';
import { TerminalesService } from '../terminales/terminales.service.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';

const CACHE_MS = 5_000;

interface PresenteBase {
  visitaId: string;
  visitante: { nombreCompleto: string; empresa: string };
  anfitrion: string;
  acompanante: string | null;
  zonaActual: { movimientoId: string; id: string; nombre: string; esSensible: boolean } | null;
  horaIngreso: Date;
  tiempoAutorizadoMin: number;
  modoContingencia: boolean;
  alertaEnviada: boolean;
  /** D8: autorizado con huella, pero el terminal de entrada aún no confirma su paso */
  sinPaso: boolean;
}

/**
 * Permanencia de lectura y registros simples (HU-12, HU-30, HU-34, HU-35).
 * La tarea programada de permanencia excedida vive en `monitoreo-permanencia`.
 */
@Injectable()
export class PermanenciaService {
  private cache: { generadoEn: Date; filas: PresenteBase[] } | null = null;
  /** Evita que una lectura iniciada antes de una invalidación deje en caché datos viejos. */
  private generacion = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly visitantes: VisitantesService,
    private readonly eventos: PublicadorEventos,
    private readonly terminales: TerminalesService,
  ) {}

  /** Lista de presentes: los excedidos primero y luego por hora de ingreso. Los minutos se calculan en cada lectura. */
  async presentes(q?: string, ahora = new Date()) {
    const { generadoEn, filas } = await this.leerPresentes(ahora);
    const texto = q?.trim().toLocaleLowerCase('es');
    const presentes = filas
      .filter((f) => !texto || f.visitante.empresa.toLocaleLowerCase('es').includes(texto) || f.visitante.nombreCompleto.toLocaleLowerCase('es').includes(texto))
      .map((f) => {
        const minutosTranscurridos = Math.floor((ahora.getTime() - f.horaIngreso.getTime()) / 60_000);
        const minutosRestantes = f.tiempoAutorizadoMin - minutosTranscurridos;
        return { ...f, minutosTranscurridos, minutosRestantes, excedido: minutosRestantes < 0 };
      })
      .sort((a, b) => Number(b.excedido) - Number(a.excedido) || a.horaIngreso.getTime() - b.horaIngreso.getTime());
    return { generadoEn, total: presentes.length, presentes };
  }

  /** Olvida la lista en memoria para que el siguiente lector vea el cambio. */
  @OnEvent(Eventos.CHECKIN_REALIZADO)
  @OnEvent(Eventos.CHECKOUT_REALIZADO)
  @OnEvent(Eventos.PASO_TERMINAL)
  invalidarPresentes(): void {
    this.generacion++;
    this.cache = null;
  }

  async registrarMovimiento(visitaId: string, zonaId: string, usuario: UsuarioAutenticado, ip?: string) {
    const visita = await this.exigirEnPlanta(visitaId);
    const zona = await this.prisma.zona.findFirst({ where: { id: zonaId, activa: true } });
    if (!zona) throw new UnprocessableEntityException({ codigo: 'ZONA_INVALIDA', mensaje: 'La zona indicada no existe o está inactiva' });
    if (zona.requiereAcompanante && !visita.acompananteId) {
      throw new UnprocessableEntityException({ codigo: 'REQUIERE_ACOMPANANTE', mensaje: `La zona ${zona.nombre} exige un acompañante. Asígnelo antes de registrar la entrada` });
    }
    await this.terminales.autorizarZona(visita, zonaId, usuario);
    const ahora = new Date();
    const movimiento = await this.prisma.$transaction(async (tx) => {
      await tx.movimientoZona.updateMany({ where: { visitaId, horaSalida: null }, data: { horaSalida: ahora } });
      return tx.movimientoZona.create({ data: { visitaId, zonaId, horaEntrada: ahora, registradoPorId: usuario.id } });
    });
    this.invalidarPresentes();
    this.eventos.publicar(Eventos.MOVIMIENTO_ZONA, {
      tipo: TipoEvento.MOVIMIENTO_ZONA,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'movimiento_zona',
      entidadId: movimiento.id,
      resultado: `entrada a ${zona.nombre}`,
      detalle: { zonaId, esSensible: zona.esSensible },
      ip,
    });
    return movimiento;
  }

  async registrarSalidaZona(visitaId: string, movimientoId: string, usuario: UsuarioAutenticado, ip?: string) {
    const movimiento = await this.prisma.movimientoZona.findFirst({ where: { id: movimientoId, visitaId }, include: { zona: { select: { nombre: true } } } });
    if (!movimiento) throw new NotFoundException({ codigo: 'MOVIMIENTO_NO_ENCONTRADO', mensaje: 'El movimiento no existe en esta visita' });
    const { count } = await this.prisma.movimientoZona.updateMany({ where: { id: movimientoId, horaSalida: null }, data: { horaSalida: new Date() } });
    if (count === 0) throw new ConflictException({ codigo: 'MOVIMIENTO_CERRADO', mensaje: 'Ya se registró la salida de esta zona' });
    this.invalidarPresentes();
    this.eventos.publicar(Eventos.MOVIMIENTO_ZONA, {
      tipo: TipoEvento.MOVIMIENTO_ZONA,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'movimiento_zona',
      entidadId: movimientoId,
      resultado: `salida de ${movimiento.zona.nombre}`,
      detalle: { zonaId: movimiento.zonaId },
      ip,
    });
    return this.prisma.movimientoZona.findUniqueOrThrow({ where: { id: movimientoId } });
  }

  async asignarAcompanante(visitaId: string, acompananteId: string, usuario: UsuarioAutenticado, ip?: string) {
    await this.exigirActiva(visitaId);
    const acompanante = await this.prisma.usuarioInterno.findFirst({ where: { id: acompananteId, activo: true }, select: { id: true, nombre: true } });
    if (!acompanante) throw new UnprocessableEntityException({ codigo: 'ACOMPANANTE_INVALIDO', mensaje: 'El acompañante indicado no existe o no está activo' });
    await this.prisma.visita.update({ where: { id: visitaId }, data: { acompananteId } });
    this.invalidarPresentes();
    this.eventos.publicar(Eventos.ACOMPANANTE_ASIGNADO, {
      tipo: TipoEvento.ACOMPANANTE_ASIGNADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'usuario',
      entidadId: acompananteId,
      resultado: `acompañante asignado: ${acompanante.nombre}`,
      ip,
    });
    return { visitaId, acompanante };
  }

  async registrarVehiculo(visitaId: string, datos: { placa: string; tipo?: string }, usuario: UsuarioAutenticado, ip?: string) {
    await this.exigirActiva(visitaId);
    const valores = { placa: datos.placa.trim().toUpperCase(), tipo: datos.tipo?.trim() || null };
    const vehiculo = await this.prisma.vehiculo.upsert({ where: { visitaId }, create: { visitaId, ...valores }, update: valores });
    // La placa identifica a una persona: no se escribe en la bitácora
    this.eventos.publicar(Eventos.VEHICULO_REGISTRADO, {
      tipo: TipoEvento.VEHICULO_REGISTRADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      entidad: 'vehiculo',
      entidadId: vehiculo.id,
      resultado: 'vehículo registrado',
      ip,
    });
    return vehiculo;
  }

  // ---------------------------------------------------------------

  private async leerPresentes(ahora: Date): Promise<{ generadoEn: Date; filas: PresenteBase[] }> {
    if (this.cache && ahora.getTime() - this.cache.generadoEn.getTime() < CACHE_MS) return this.cache;
    const generacion = this.generacion;
    const visitas = await this.prisma.visita.findMany({
      where: { estado: EstadoVisita.EN_PLANTA, horaIngreso: { not: null } },
      include: {
        visitante: true,
        anfitrion: { select: { nombre: true } },
        acompanante: { select: { nombre: true } },
        movimientos: { where: { horaSalida: null }, orderBy: { horaEntrada: 'desc' }, take: 1, include: { zona: true } },
      },
    });
    const filas = visitas.map((v): PresenteBase => {
      const { nombreCompleto, empresa } = this.visitantes.resumen(v.visitante);
      const abierto = v.movimientos[0];
      return {
        visitaId: v.id,
        visitante: { nombreCompleto, empresa },
        anfitrion: v.anfitrion.nombre,
        acompanante: v.acompanante?.nombre ?? null,
        zonaActual: abierto ? { movimientoId: abierto.id, id: abierto.zona.id, nombre: abierto.zona.nombre, esSensible: abierto.zona.esSensible } : null,
        horaIngreso: v.horaIngreso!,
        tiempoAutorizadoMin: v.tiempoAutorizadoMin,
        modoContingencia: v.modoContingencia,
        alertaEnviada: v.alertaPermanenciaEn !== null,
        sinPaso: v.metodoIdentificacion === MetodoId.HUELLA && !v.ingresoFisicoEn,
      };
    });
    const resultado = { generadoEn: ahora, filas };
    if (generacion === this.generacion) this.cache = resultado;
    return resultado;
  }

  private async exigirEnPlanta(visitaId: string) {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId } });
    if (!visita) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    if (visita.estado !== EstadoVisita.EN_PLANTA) {
      throw new ConflictException({ codigo: 'VISITA_NO_EN_PLANTA', mensaje: 'El visitante no tiene un check-in activo' });
    }
    return visita;
  }

  private async exigirActiva(visitaId: string) {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId }, select: { estado: true } });
    if (!visita) throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    if (visita.estado === EstadoVisita.FINALIZADA || visita.estado === EstadoVisita.CANCELADA) {
      throw new ConflictException({ codigo: 'VISITA_NO_ACTIVA', mensaje: 'La visita ya finalizó o fue cancelada' });
    }
  }
}
