import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';

/**
 * Con una contraseña temporal solo se puede usar /auth (cambiarla o cerrar
 * sesión). Se ejecuta después de JwtAuthGuard.
 */
@Injectable()
export class ContrasenaTemporalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    if (!request.user?.debeCambiarContrasena || request.path.includes('/auth/')) return true;
    throw new ForbiddenException({ codigo: 'CONTRASENA_TEMPORAL', mensaje: 'Debe cambiar su contraseña temporal antes de continuar' });
  }
}
