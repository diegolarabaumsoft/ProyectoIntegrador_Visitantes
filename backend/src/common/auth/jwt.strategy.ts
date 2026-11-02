import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { COOKIE_ACCESO, type JwtPayload, type UsuarioAutenticado } from './usuario-autenticado.js';

/**
 * Estrategia JWT. Acepta el token desde la cookie httpOnly `vms_access`
 * (navegador) o desde `Authorization: Bearer` (clientes de API y pruebas).
 * Verifica que el usuario siga activo en cada petición (RNF-07).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req.cookies as Record<string, string> | undefined)?.[COOKIE_ACCESO] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuarioInterno.findUnique({
      where: { id: payload.sub },
      select: { id: true, nombre: true, correo: true, rol: true, activo: true, debeCambiarContrasena: true },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException({ codigo: 'SESION_INVALIDA', mensaje: 'La sesión no es válida' });
    }
    return { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol, debeCambiarContrasena: usuario.debeCambiarContrasena };
  }
}
