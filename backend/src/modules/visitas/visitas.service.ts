import { Injectable, NotFoundException } from '@nestjs/common';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { paginar } from '../../common/dto/paginacion.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Rol } from '../../generated/prisma/enums.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';
import type { ListarVisitasDto } from './dto/listar-visitas.dto.js';

/** Histórico de visitas (HU-27). El anfitrión solo ve las suyas y sin el documento completo. */
@Injectable()
export class VisitasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly visitantes: VisitantesService,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar(dto: ListarVisitasDto, usuario: UsuarioAutenticado) {
    const documento = dto.documento?.trim();
    const where: Prisma.VisitaWhereInput = {
      ...(usuario.rol === Rol.ANFITRION ? { anfitrionId: usuario.id } : dto.anfitrionId ? { anfitrionId: dto.anfitrionId } : {}),
      ...(dto.estado ? { estado: dto.estado } : {}),
      ...(dto.desde || dto.hasta ? { fechaProgramada: { ...(dto.desde ? { gte: dto.desde } : {}), ...(dto.hasta ? { lte: dto.hasta } : {}) } } : {}),
      visitante: {
        ...(dto.empresa?.trim() ? { empresa: { contains: dto.empresa.trim(), mode: 'insensitive' } } : {}),
        ...(documento ? { numeroDocumentoHash: this.crypto.hashDocumento(documento) } : {}),
      },
    };
    const [filas, total] = await Promise.all([
      this.prisma.visita.findMany({
        where,
        include: { visitante: true, anfitrion: { select: { nombre: true } } },
        orderBy: { fechaProgramada: 'desc' },
        skip: dto.skip,
        take: dto.limite,
      }),
      this.prisma.visita.count({ where }),
    ]);
    const datos = filas.map((v) => {
      const { nombreCompleto, empresa } = this.visitantes.resumen(v.visitante);
      return {
        id: v.id,
        estado: v.estado,
        fechaProgramada: v.fechaProgramada,
        horaIngreso: v.horaIngreso,
        horaSalida: v.horaSalida,
        motivo: v.motivo,
        esExpres: v.esExpres,
        metodoIdentificacion: v.metodoIdentificacion,
        visitante: { nombreCompleto, empresa },
        anfitrion: v.anfitrion.nombre,
      };
    });
    return paginar(datos, total, dto);
  }

  async detalle(id: string, usuario: UsuarioAutenticado) {
    const v = await this.prisma.visita.findUnique({
      where: { id },
      include: {
        visitante: true,
        anfitrion: { select: { id: true, nombre: true, area: true } },
        acompanante: { select: { nombre: true } },
        credencial: { select: { activa: true, venceEn: true, fisicaEntregada: true, fisicaDevuelta: true } },
        consentimiento: { select: { versionPolitica: true, fechaHoraAceptacion: true } },
        entregasEpp: { select: { elemento: true, entregado: true, devuelto: true } },
        vehiculo: { select: { placa: true, tipo: true } },
        movimientos: { orderBy: { horaEntrada: 'asc' }, include: { zona: { select: { nombre: true, esSensible: true } } } },
      },
    });
    // 404 también para la visita ajena: no se revela que existe
    if (!v || (usuario.rol === Rol.ANFITRION && v.anfitrionId !== usuario.id)) {
      throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    }
    const p = this.visitantes.descifrar(v.visitante);
    const documento = usuario.rol === Rol.ANFITRION && !p.anonimizado ? `****${p.numeroDocumento.slice(-4)}` : p.numeroDocumento;
    return {
      id: v.id,
      estado: v.estado,
      fechaProgramada: v.fechaProgramada,
      horaIngreso: v.horaIngreso,
      horaSalida: v.horaSalida,
      tiempoAutorizadoMin: v.tiempoAutorizadoMin,
      motivo: v.motivo,
      esExpres: v.esExpres,
      metodoIdentificacion: v.metodoIdentificacion,
      modoContingencia: v.modoContingencia,
      satisfaccion: v.satisfaccion,
      visitante: { nombreCompleto: p.nombreCompleto, tipoDocumento: p.tipoDocumento, numeroDocumento: documento, empresa: p.empresa },
      anfitrion: { nombre: v.anfitrion.nombre, area: v.anfitrion.area },
      acompanante: v.acompanante?.nombre ?? null,
      credencial: v.credencial,
      consentimiento: v.consentimiento,
      epp: v.entregasEpp,
      vehiculo: v.vehiculo,
      movimientos: v.movimientos.map((m) => ({ id: m.id, zona: m.zona.nombre, esSensible: m.zona.esSensible, horaEntrada: m.horaEntrada, horaSalida: m.horaSalida })),
      eventos: await this.bitacora.porVisitaPara(v.id, usuario),
    };
  }
}
