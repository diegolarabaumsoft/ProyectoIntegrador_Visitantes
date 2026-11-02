import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';

/** Inyecta el usuario autenticado en el parámetro de un handler. */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const request = ctx.switchToHttp().getRequest<Request & { user: UsuarioAutenticado }>();
    return request.user;
  },
);
