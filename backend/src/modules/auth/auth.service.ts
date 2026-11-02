import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { JwtPayload, UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { duracionAMs } from '../../common/utils/duracion.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { TipoEvento } from '../../generated/prisma/enums.js';

export interface ResultadoSesion {
  usuario: UsuarioAutenticado;
  accessToken: string;
  refreshToken: string;
  accessTtlMs: number;
  refreshTtlMs: number;
}

/**
 * Autenticación de usuarios internos (HU-25).
 * - Bloquea la cuenta tras N intentos fallidos consecutivos (LOGIN_MAX_INTENTOS).
 * - Emite un token de acceso corto y un refresh token opaco (hash en BD).
 * - La renovación exige actividad reciente: sin actividad en 15 minutos se cierra la sesión.
 */
@Injectable()
export class AuthService {
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly eventos: PublicadorEventos,
    private readonly configuracion: ConfiguracionService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlMs = duracionAMs(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtlMs = duracionAMs(config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  async login(correo: string, contrasena: string, ip?: string): Promise<ResultadoSesion> {
    const usuario = await this.prisma.usuarioInterno.findUnique({ where: { correo } });
    const ahora = new Date();

    if (!usuario || !usuario.activo) {
      // Mismo mensaje que una contraseña incorrecta para no revelar cuentas existentes
      this.eventos.publicar(Eventos.LOGIN_FALLIDO, {
        tipo: TipoEvento.LOGIN_FALLIDO,
        actor: correo,
        resultado: 'usuario inexistente o inactivo',
        ip,
      });
      throw new UnauthorizedException({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' });
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
      const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - ahora.getTime()) / 60_000);
      throw new UnauthorizedException({
        codigo: 'CUENTA_BLOQUEADA',
        mensaje: `Cuenta bloqueada por intentos fallidos. Intente de nuevo en ${minutos} min o contacte al administrador`,
        detalles: { bloqueadoHasta: usuario.bloqueadoHasta },
      });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.hashContrasena);
    if (!coincide) {
      const [maxIntentos, bloqueoMin] = await Promise.all([this.configuracion.numero('login_max_intentos'), this.configuracion.numero('login_bloqueo_min')]);
      const intentos = usuario.intentosFallidos + 1;
      const bloquear = intentos >= maxIntentos;
      await this.prisma.usuarioInterno.update({
        where: { id: usuario.id },
        data: {
          intentosFallidos: bloquear ? 0 : intentos,
          bloqueadoHasta: bloquear ? new Date(ahora.getTime() + bloqueoMin * 60_000) : null,
        },
      });
      this.eventos.publicar(Eventos.LOGIN_FALLIDO, {
        tipo: TipoEvento.LOGIN_FALLIDO,
        actor: usuario.nombre,
        actorId: usuario.id,
        resultado: `intento ${intentos} de ${maxIntentos}`,
        ip,
      });
      if (bloquear) {
        this.eventos.publicar(Eventos.CUENTA_BLOQUEADA, {
          tipo: TipoEvento.CUENTA_BLOQUEADA,
          actor: usuario.nombre,
          actorId: usuario.id,
          resultado: `bloqueada ${bloqueoMin} min tras ${maxIntentos} intentos fallidos`,
          ip,
        });
        throw new UnauthorizedException({
          codigo: 'CUENTA_BLOQUEADA',
          mensaje: `Cuenta bloqueada tras ${maxIntentos} intentos fallidos. Intente de nuevo en ${bloqueoMin} min o contacte al administrador`,
        });
      }
      throw new UnauthorizedException({
        codigo: 'CREDENCIALES_INVALIDAS',
        mensaje: 'Correo o contraseña incorrectos',
        detalles: { intentosRestantes: maxIntentos - intentos },
      });
    }

    await this.prisma.usuarioInterno.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: ahora },
    });

    const sesion = await this.emitirSesion({ id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol });
    this.eventos.publicar(Eventos.LOGIN_EXITOSO, {
      tipo: TipoEvento.LOGIN_OK,
      actor: usuario.nombre,
      actorId: usuario.id,
      resultado: 'inicio de sesión',
      ip,
    });
    return sesion;
  }

  /** Renueva el token de acceso si el refresh token es válido y hubo actividad reciente. */
  async refrescar(refreshToken: string | undefined): Promise<ResultadoSesion> {
    // Minutos de inactividad tras los cuales la sesión no puede renovarse (HU-25)
    const inactividadMaxMin = await this.configuracion.numero('sesion_inactividad_min');
    if (!refreshToken) {
      throw new UnauthorizedException({ codigo: 'SESION_INVALIDA', mensaje: 'No hay sesión activa' });
    }
    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.crypto.hashToken(refreshToken) },
      include: { usuario: true },
    });
    const ahora = new Date();
    if (!registro || registro.revocado || registro.expiraEn < ahora || !registro.usuario.activo) {
      throw new UnauthorizedException({ codigo: 'SESION_INVALIDA', mensaje: 'La sesión no es válida' });
    }

    const ultimoAcceso = registro.usuario.ultimoAcceso ?? registro.createdAt;
    if (ahora.getTime() - ultimoAcceso.getTime() > inactividadMaxMin * 60_000) {
      await this.prisma.refreshToken.update({ where: { id: registro.id }, data: { revocado: true } });
      this.eventos.publicar(Eventos.SESION_CERRADA, {
        tipo: TipoEvento.SESION_CERRADA,
        actor: registro.usuario.nombre,
        actorId: registro.usuario.id,
        resultado: `cierre por inactividad (> ${inactividadMaxMin} min)`,
      });
      throw new UnauthorizedException({
        codigo: 'SESION_EXPIRADA',
        mensaje: `La sesión se cerró tras ${inactividadMaxMin} minutos de inactividad`,
      });
    }

    // Rotación: el refresh token usado se revoca y se emite uno nuevo
    await this.prisma.refreshToken.update({ where: { id: registro.id }, data: { revocado: true } });
    await this.prisma.usuarioInterno.update({ where: { id: registro.usuarioId }, data: { ultimoAcceso: ahora } });
    const u = registro.usuario;
    return this.emitirSesion({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol });
  }

  /** Cambia la contraseña propia y cierra las demás sesiones: un robo de sesión no sobrevive al cambio. */
  async cambiarContrasena(usuario: UsuarioAutenticado, actual: string, nueva: string, refreshActual: string | undefined, ip?: string): Promise<void> {
    const registro = await this.prisma.usuarioInterno.findUniqueOrThrow({ where: { id: usuario.id }, select: { hashContrasena: true } });
    if (!(await bcrypt.compare(actual, registro.hashContrasena))) {
      throw new UnprocessableEntityException({ codigo: 'CONTRASENA_INCORRECTA', mensaje: 'La contraseña actual no es correcta' });
    }
    if (actual === nueva) throw new UnprocessableEntityException({ codigo: 'CONTRASENA_REPETIDA', mensaje: 'La contraseña nueva debe ser distinta de la actual' });
    await this.prisma.usuarioInterno.update({ where: { id: usuario.id }, data: { hashContrasena: await bcrypt.hash(nueva, 12), debeCambiarContrasena: false } });
    await this.prisma.refreshToken.updateMany({ where: { usuarioId: usuario.id, revocado: false, ...(refreshActual ? { tokenHash: { not: this.crypto.hashToken(refreshActual) } } : {}) }, data: { revocado: true } });
    this.eventos.publicar(Eventos.USUARIO_MODIFICADO, { tipo: TipoEvento.USUARIO_MODIFICADO, actor: usuario.nombre, actorId: usuario.id, entidad: 'usuario', entidadId: usuario.id, resultado: 'contraseña cambiada por el usuario', ip });
  }

  async cerrarSesion(refreshToken: string | undefined, usuario?: UsuarioAutenticado): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.crypto.hashToken(refreshToken), revocado: false },
        data: { revocado: true },
      });
    }
    if (usuario) {
      this.eventos.publicar(Eventos.SESION_CERRADA, {
        tipo: TipoEvento.SESION_CERRADA,
        actor: usuario.nombre,
        actorId: usuario.id,
        resultado: 'cierre de sesión',
      });
    }
  }

  /** Marca actividad del usuario (usado por el interceptor en cada petición autenticada). */
  async registrarActividad(usuarioId: string): Promise<void> {
    await this.prisma.usuarioInterno.update({ where: { id: usuarioId }, data: { ultimoAcceso: new Date() } });
  }

  private async emitirSesion(usuario: UsuarioAutenticado): Promise<ResultadoSesion> {
    const payload: JwtPayload = { sub: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = this.crypto.tokenAleatorio(48);
    await this.prisma.refreshToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: this.crypto.hashToken(refreshToken),
        expiraEn: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    return { usuario, accessToken, refreshToken, accessTtlMs: this.accessTtlMs, refreshTtlMs: this.refreshTtlMs };
  }
}
