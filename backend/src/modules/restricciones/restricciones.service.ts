import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { paginar } from '../../common/dto/paginacion.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { ActualizarRestriccionDto } from './dto/actualizar-restriccion.dto.js';
import { CrearRestriccionDto } from './dto/crear-restriccion.dto.js';
import { ListarRestriccionesDto } from './dto/listar-restricciones.dto.js';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';

export interface Coincidencia {
  id: string;
  nombreReferencia: string;
  motivo: string;
  fechaRegistro: Date;
}

export interface EntradaRestriccionPublica {
  id: string;
  numeroDocumento: string;
  nombreReferencia: string;
  motivo: string;
  fechaRegistro: Date;
  activa: boolean;
  autor: { id: string; nombre: string; correo: string };
  actualizadoPorId: string | null;
  updatedAt: Date;
}

function enmascararDocumento(doc: string): string {
  const ultimosCuatro = doc.slice(-4);
  return `****${ultimosCuatro}`;
}

@Injectable()
export class RestriccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly eventos: PublicadorEventos,
    private readonly bitacora: BitacoraService,
  ) {}

  /**
   * Consulta paginada con filtros.
   * El número de documento se entrega descifrado a administradores y jefes de seguridad,
   * y enmascarado (****3210) a recepción.
   */
  async listar(dto: ListarRestriccionesDto, rol: Rol) {
    const where: Prisma.EntradaRestriccionWhereInput = {
      ...(dto.activa !== undefined ? { activa: dto.activa } : { activa: true }),
      ...(dto.q
        ? {
            OR: [
              { nombreReferencia: { contains: dto.q, mode: 'insensitive' } },
              { motivo: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.entradaRestriccion.findMany({
        where,
        orderBy: { fechaRegistro: 'desc' },
        skip: dto.skip,
        take: dto.limite,
        include: {
          autor: {
            select: { id: true, nombre: true, correo: true },
          },
        },
      }),
      this.prisma.entradaRestriccion.count({ where }),
    ]);

    const esRolCompleto = rol === Rol.ADMINISTRADOR || rol === Rol.JEFE_SEGURIDAD;

    const elementos: EntradaRestriccionPublica[] = datos.map((entrada) => {
      let documento = '';
      try {
        const descifrado = this.crypto.descifrar(entrada.numeroDocumento);
        documento = esRolCompleto ? descifrado : enmascararDocumento(descifrado);
      } catch {
        documento = '****';
      }

      return {
        id: entrada.id,
        numeroDocumento: documento,
        nombreReferencia: entrada.nombreReferencia,
        motivo: entrada.motivo,
        fechaRegistro: entrada.fechaRegistro,
        activa: entrada.activa,
        autor: entrada.autor,
        actualizadoPorId: entrada.actualizadoPorId,
        updatedAt: entrada.updatedAt,
      };
    });

    return paginar(elementos, total, dto);
  }

  /**
   * Registra una nueva entrada de restricción. Cifra el documento y calcula su hash determinista.
   */
  async crear(dto: CrearRestriccionDto, usuario: UsuarioAutenticado, ip?: string) {
    const hash = this.crypto.hashDocumento(dto.numeroDocumento);

    const existente = await this.prisma.entradaRestriccion.findFirst({
      where: { numeroDocumentoHash: hash, activa: true },
    });

    if (existente) {
      throw new ConflictException({
        codigo: 'RESTRICCION_DUPLICADA',
        mensaje: 'Ya existe una restricción activa para este número de documento',
      });
    }

    const documentoCifrado = this.crypto.cifrar(dto.numeroDocumento);

    const entrada = await this.prisma.entradaRestriccion.create({
      data: {
        numeroDocumentoHash: hash,
        numeroDocumento: documentoCifrado,
        nombreReferencia: dto.nombreReferencia,
        motivo: dto.motivo,
        autorId: usuario.id,
      },
      include: {
        autor: {
          select: { id: true, nombre: true, correo: true },
        },
      },
    });

    this.eventos.publicar(Eventos.RESTRICCION_CREADA, {
      tipo: TipoEvento.RESTRICCION_CREADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'restriccion',
      entidadId: entrada.id,
      resultado: 'EXITO',
      detalle: {
        motivo: entrada.motivo,
      },
      ip,
    });

    return {
      id: entrada.id,
      numeroDocumento: dto.numeroDocumento,
      nombreReferencia: entrada.nombreReferencia,
      motivo: entrada.motivo,
      fechaRegistro: entrada.fechaRegistro,
      activa: entrada.activa,
      autor: entrada.autor,
      actualizadoPorId: entrada.actualizadoPorId,
      updatedAt: entrada.updatedAt,
    };
  }

  /**
   * Modifica los datos de referencia o motivo de una restricción existente.
   */
  async actualizar(id: string, dto: ActualizarRestriccionDto, usuario: UsuarioAutenticado, ip?: string) {
    const entrada = await this.prisma.entradaRestriccion.findUnique({
      where: { id },
      include: {
        autor: {
          select: { id: true, nombre: true, correo: true },
        },
      },
    });

    if (!entrada) {
      throw new NotFoundException({
        codigo: 'RESTRICCION_NO_ENCONTRADA',
        mensaje: 'La restricción especificada no existe',
      });
    }

    const actualizada = await this.prisma.entradaRestriccion.update({
      where: { id },
      data: {
        ...(dto.nombreReferencia !== undefined ? { nombreReferencia: dto.nombreReferencia } : {}),
        ...(dto.motivo !== undefined ? { motivo: dto.motivo } : {}),
        actualizadoPorId: usuario.id,
      },
      include: {
        autor: {
          select: { id: true, nombre: true, correo: true },
        },
      },
    });

    this.eventos.publicar(Eventos.RESTRICCION_MODIFICADA, {
      tipo: TipoEvento.RESTRICCION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'restriccion',
      entidadId: actualizada.id,
      resultado: 'EXITO',
      detalle: {
        motivo: actualizada.motivo,
      },
      ip,
    });

    let documento = '';
    try {
      documento = this.crypto.descifrar(actualizada.numeroDocumento);
    } catch {
      documento = '****';
    }

    return {
      id: actualizada.id,
      numeroDocumento: documento,
      nombreReferencia: actualizada.nombreReferencia,
      motivo: actualizada.motivo,
      fechaRegistro: actualizada.fechaRegistro,
      activa: actualizada.activa,
      autor: actualizada.autor,
      actualizadoPorId: actualizada.actualizadoPorId,
      updatedAt: actualizada.updatedAt,
    };
  }

  /**
   * Baja lógica de una restricción (activa=false).
   */
  async eliminar(id: string, usuario: UsuarioAutenticado, ip?: string): Promise<void> {
    const entrada = await this.prisma.entradaRestriccion.findUnique({
      where: { id },
    });

    if (!entrada) {
      throw new NotFoundException({
        codigo: 'RESTRICCION_NO_ENCONTRADA',
        mensaje: 'La restricción especificada no existe',
      });
    }

    await this.prisma.entradaRestriccion.update({
      where: { id },
      data: {
        activa: false,
        actualizadoPorId: usuario.id,
      },
    });

    this.eventos.publicar(Eventos.RESTRICCION_ELIMINADA, {
      tipo: TipoEvento.RESTRICCION_ELIMINADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'restriccion',
      entidadId: entrada.id,
      resultado: 'EXITO',
      detalle: {
        motivo: entrada.motivo,
      },
      ip,
    });
  }

  /**
   * Eventos de bitácora asociados a esta restricción.
   */
  async historial(id: string, paginacion: PaginacionDto) {
    return this.bitacora.consultar({ entidad: 'restriccion', entidadId: id }, paginacion);
  }

  /**
   * Servicio compartido (contrato fijo para CL-01).
   * Busca si existe una entrada activa con el mismo hash del documento.
   */
  async verificar(numeroDocumento: string): Promise<Coincidencia | null> {
    const hash = this.crypto.hashDocumento(numeroDocumento);
    const entrada = await this.prisma.entradaRestriccion.findFirst({
      where: { numeroDocumentoHash: hash, activa: true },
      select: {
        id: true,
        nombreReferencia: true,
        motivo: true,
        fechaRegistro: true,
      },
    });

    return entrada;
  }
}
