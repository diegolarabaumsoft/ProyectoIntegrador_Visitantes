import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TipoEvento } from '../../generated/prisma/enums.js';
import { ActualizarZonaDto } from './dto/actualizar-zona.dto.js';
import { CrearZonaDto } from './dto/crear-zona.dto.js';
import { ListarZonasDto } from './dto/listar-zonas.dto.js';

@Injectable()
export class ZonasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: PublicadorEventos,
  ) {}

  /**
   * Listar zonas de la planta.
   * Si se envía el filtro `activa`, restringe por ese estado; de lo contrario devuelve todas.
   */
  async listar(dto?: ListarZonasDto) {
    const where: Prisma.ZonaWhereInput = dto?.activa !== undefined ? { activa: dto.activa } : {};

    return this.prisma.zona.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Crear nueva zona de la planta.
   */
  async crear(dto: CrearZonaDto, usuario: UsuarioAutenticado, ip?: string) {
    const existente = await this.prisma.zona.findFirst({
      where: { nombre: { equals: dto.nombre, mode: 'insensitive' } },
    });

    if (existente) {
      throw new ConflictException({
        codigo: 'ZONA_DUPLICADA',
        mensaje: 'Ya existe una zona con ese nombre',
      });
    }

    const zona = await this.prisma.zona.create({
      data: {
        nombre: dto.nombre,
        esSensible: dto.esSensible ?? false,
        requiereAcompanante: dto.requiereAcompanante ?? false,
        activa: true,
      },
    });

    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, {
      tipo: TipoEvento.CONFIGURACION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'zona',
      entidadId: zona.id,
      resultado: 'zona creada',
      detalle: {
        accion: 'crear',
        nombre: zona.nombre,
        esSensible: zona.esSensible,
        requiereAcompanante: zona.requiereAcompanante,
      },
      ip,
    });

    return zona;
  }

  /**
   * Modificar datos de una zona.
   */
  async actualizar(id: string, dto: ActualizarZonaDto, usuario: UsuarioAutenticado, ip?: string) {
    const actual = await this.prisma.zona.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException({
        codigo: 'ZONA_NO_ENCONTRADA',
        mensaje: 'La zona especificada no existe',
      });
    }

    if (dto.nombre && dto.nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      const repetida = await this.prisma.zona.findFirst({
        where: {
          nombre: { equals: dto.nombre, mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (repetida) {
        throw new ConflictException({
          codigo: 'ZONA_DUPLICADA',
          mensaje: 'Ya existe una zona con ese nombre',
        });
      }
    }

    const zona = await this.prisma.zona.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.esSensible !== undefined ? { esSensible: dto.esSensible } : {}),
        ...(dto.requiereAcompanante !== undefined ? { requiereAcompanante: dto.requiereAcompanante } : {}),
        ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
      },
    });

    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, {
      tipo: TipoEvento.CONFIGURACION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'zona',
      entidadId: zona.id,
      resultado: 'zona actualizada',
      detalle: {
        accion: 'actualizar',
        nombre: zona.nombre,
        esSensible: zona.esSensible,
        requiereAcompanante: zona.requiereAcompanante,
        activa: zona.activa,
      },
      ip,
    });

    return zona;
  }

  /**
   * Desactivar una zona.
   */
  async desactivar(id: string, usuario: UsuarioAutenticado, ip?: string) {
    const actual = await this.prisma.zona.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException({
        codigo: 'ZONA_NO_ENCONTRADA',
        mensaje: 'La zona especificada no existe',
      });
    }

    const zona = await this.prisma.zona.update({
      where: { id },
      data: { activa: false },
    });

    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, {
      tipo: TipoEvento.CONFIGURACION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'zona',
      entidadId: zona.id,
      resultado: 'zona desactivada',
      detalle: {
        accion: 'desactivar',
        nombre: zona.nombre,
        activa: false,
      },
      ip,
    });

    return zona;
  }
}
