import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Rol } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ROLES_PERMITIDOS } from '../decorators/roles.decorator.js';

/**
 * Control de acceso basado en roles (RBAC, RNF-07). Se ejecuta después de
 * JwtAuthGuard, por lo que `request.user` ya está disponible.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_PERMITIDOS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    const usuario = request.user;
    if (!usuario) {
      return true; // Endpoint público: nada que verificar
    }
    if (!roles.includes(usuario.rol)) {
      throw new ForbiddenException({
        codigo: 'ROL_NO_AUTORIZADO',
        mensaje: 'Su rol no tiene permiso para esta operación',
      });
    }
    return true;
  }
}
