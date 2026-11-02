import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { paginar } from '../../common/dto/paginacion.dto.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { EstadoNotificacion, Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { correoBienvenidaUsuario } from '../../integraciones/correo/plantillas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { ActualizarUsuarioDto, CrearUsuarioDto, ListarUsuariosDto } from './dto/usuarios.dto.js';

// Nunca se selecciona hashContrasena
const PUBLICO = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
  area: true,
  activo: true,
  bloqueadoHasta: true,
  ultimoAcceso: true,
  createdAt: true,
} satisfies Prisma.UsuarioInternoSelect;

const TIPO_NOTIFICACION = 'BIENVENIDA_USUARIO';

/** Usuarios internos y roles (HU-26): cada usuario tiene exactamente un rol. */
@Injectable()
export class UsuariosService {
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly notificaciones: NotificacionesService,
    private readonly eventos: PublicadorEventos,
    config: ConfigService<Env, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true }).replace(/\/$/, '');
  }

  async listar(dto: ListarUsuariosDto) {
    const where: Prisma.UsuarioInternoWhereInput = {
      ...(dto.rol ? { rol: dto.rol } : {}),
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
    };
    const [datos, total] = await Promise.all([
      this.prisma.usuarioInterno.findMany({ where, select: PUBLICO, orderBy: { nombre: 'asc' }, skip: dto.skip, take: dto.limite }),
      this.prisma.usuarioInterno.count({ where }),
    ]);
    return paginar(datos, total, dto);
  }

  async anfitriones() {
    return this.prisma.usuarioInterno.findMany({ where: { activo: true, rol: Rol.ANFITRION }, select: { id: true, nombre: true, area: true }, orderBy: { nombre: 'asc' } });
  }

  async detalle(id: string) {
    const usuario = await this.prisma.usuarioInterno.findUnique({ where: { id }, select: PUBLICO });
    if (!usuario) throw new NotFoundException({ codigo: 'USUARIO_NO_ENCONTRADO', mensaje: 'El usuario no existe' });
    return usuario;
  }

  async crear(dto: CrearUsuarioDto, actor: UsuarioAutenticado, ip?: string) {
    await this.exigirCorreoLibre(dto.correo);
    const temporal = this.crypto.tokenAleatorio(9);
    const usuario = await this.prisma.usuarioInterno.create({
      data: { nombre: dto.nombre, correo: dto.correo, rol: dto.rol, area: this.areaPara(dto.rol, dto.area), hashContrasena: await bcrypt.hash(temporal, 12), debeCambiarContrasena: true },
      select: PUBLICO,
    });
    this.publicar(Eventos.USUARIO_CREADO, TipoEvento.USUARIO_CREADO, 'usuario creado', usuario, actor, ip);
    return { ...usuario, correoEnviado: await this.enviarContrasena(usuario, temporal) };
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto, actor: UsuarioAutenticado, ip?: string) {
    const actual = await this.detalle(id);
    if (dto.correo && dto.correo !== actual.correo) await this.exigirCorreoLibre(dto.correo);
    const cambiaRol = dto.rol !== undefined && dto.rol !== actual.rol;
    if (cambiaRol && id === actor.id) {
      throw new ConflictException({ codigo: 'NO_PUEDE_CAMBIAR_SU_ROL', mensaje: 'No puede cambiar su propio rol' });
    }
    const rol = dto.rol ?? actual.rol;
    const usuario = await this.prisma.usuarioInterno.update({
      where: { id },
      data: { nombre: dto.nombre, correo: dto.correo, rol, area: this.areaPara(rol, dto.area ?? actual.area ?? undefined) },
      select: PUBLICO,
    });
    // El rol se lee de la base en cada petición; esto además obliga a renovar la cookie de navegación
    if (cambiaRol) await this.revocarSesiones(id);
    this.publicar(Eventos.USUARIO_MODIFICADO, TipoEvento.USUARIO_MODIFICADO, 'usuario modificado', usuario, actor, ip);
    return usuario;
  }

  async desactivar(id: string, actor: UsuarioAutenticado, ip?: string) {
    if (id === actor.id) throw new ConflictException({ codigo: 'NO_PUEDE_DESACTIVARSE', mensaje: 'No puede desactivar su propia cuenta' });
    await this.detalle(id);
    const usuario = await this.prisma.usuarioInterno.update({ where: { id }, data: { activo: false }, select: PUBLICO });
    await this.revocarSesiones(id);
    this.publicar(Eventos.USUARIO_DESACTIVADO, TipoEvento.USUARIO_DESACTIVADO, 'usuario desactivado', usuario, actor, ip);
    return usuario;
  }

  async reactivar(id: string, actor: UsuarioAutenticado, ip?: string) {
    await this.detalle(id);
    const usuario = await this.prisma.usuarioInterno.update({ where: { id }, data: { activo: true, intentosFallidos: 0, bloqueadoHasta: null }, select: PUBLICO });
    this.publicar(Eventos.USUARIO_MODIFICADO, TipoEvento.USUARIO_MODIFICADO, 'usuario reactivado', usuario, actor, ip);
    return usuario;
  }

  async desbloquear(id: string, actor: UsuarioAutenticado, ip?: string) {
    await this.detalle(id);
    const usuario = await this.prisma.usuarioInterno.update({ where: { id }, data: { intentosFallidos: 0, bloqueadoHasta: null }, select: PUBLICO });
    this.publicar(Eventos.USUARIO_MODIFICADO, TipoEvento.USUARIO_MODIFICADO, 'usuario desbloqueado', usuario, actor, ip);
    return usuario;
  }

  /** Genera y envía otra contraseña temporal; sin esto, un correo de bienvenida fallido dejaría la cuenta inaccesible. */
  async restablecerContrasena(id: string, actor: UsuarioAutenticado, ip?: string) {
    const actual = await this.detalle(id);
    const temporal = this.crypto.tokenAleatorio(9);
    const usuario = await this.prisma.usuarioInterno.update({
      where: { id },
      data: { hashContrasena: await bcrypt.hash(temporal, 12), debeCambiarContrasena: true, intentosFallidos: 0, bloqueadoHasta: null },
      select: PUBLICO,
    });
    await this.revocarSesiones(id);
    this.publicar(Eventos.USUARIO_MODIFICADO, TipoEvento.USUARIO_MODIFICADO, 'contraseña restablecida', actual, actor, ip);
    return { ...usuario, correoEnviado: await this.enviarContrasena(usuario, temporal) };
  }

  // ---------------------------------------------------------------

  private areaPara(rol: Rol, area: string | undefined): string | null {
    return rol === Rol.ANFITRION ? area || null : null;
  }

  private async exigirCorreoLibre(correo: string): Promise<void> {
    const existente = await this.prisma.usuarioInterno.findUnique({ where: { correo }, select: { id: true } });
    if (existente) throw new ConflictException({ codigo: 'CORREO_DUPLICADO', mensaje: 'Ya existe un usuario con ese correo' });
  }

  private async revocarSesiones(usuarioId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { usuarioId, revocado: false }, data: { revocado: true } });
  }

  /** Va solo en el HTML: el texto del correo se guarda en el historial de notificaciones y la contraseña no debe quedar ahí. */
  private async enviarContrasena(usuario: { id: string; nombre: string; correo: string }, temporal: string): Promise<boolean> {
    const { asunto, html } = correoBienvenidaUsuario({ nombre: usuario.nombre, correo: usuario.correo, contrasenaTemporal: temporal, enlaceAcceso: `${this.frontendUrl}/login` });
    await this.notificaciones.enviarCorreo({ destinatario: usuario.correo, asunto, html, tipo: TIPO_NOTIFICACION });
    const registro = await this.prisma.notificacion.findFirst({ where: { destinatario: usuario.correo, tipo: TIPO_NOTIFICACION }, orderBy: { createdAt: 'desc' }, select: { estado: true } });
    return registro?.estado === EstadoNotificacion.ENVIADA;
  }

  private publicar(
    nombre: (typeof Eventos)['USUARIO_CREADO' | 'USUARIO_MODIFICADO' | 'USUARIO_DESACTIVADO'],
    tipo: TipoEvento,
    resultado: string,
    usuario: { id: string; rol: Rol },
    actor: UsuarioAutenticado,
    ip?: string,
  ): void {
    this.eventos.publicar(nombre, { tipo, actor: actor.nombre, actorId: actor.id, entidad: 'usuario', entidadId: usuario.id, resultado, detalle: { rol: usuario.rol }, ip });
  }
}
