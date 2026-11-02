import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { AuthService } from './auth.service.js';

/** Intervalo mínimo entre actualizaciones de `ultimoAcceso` por usuario. */
const INTERVALO_MS = 60_000;

/**
 * Registra la actividad del usuario autenticado para aplicar el cierre de
 * sesión por inactividad (HU-25). Evita una escritura por petición
 * recordando en memoria la última actualización de cada usuario.
 */
@Injectable()
export class ActividadInterceptor implements NestInterceptor {
  private readonly ultimaActualizacion = new Map<string, number>();

  constructor(private readonly auth: AuthService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    const usuario = req.user;
    if (usuario) {
      const ahora = Date.now();
      const ultima = this.ultimaActualizacion.get(usuario.id) ?? 0;
      if (ahora - ultima > INTERVALO_MS) {
        this.ultimaActualizacion.set(usuario.id, ahora);
        void this.auth.registrarActividad(usuario.id).catch(() => undefined);
      }
    }
    return next.handle();
  }
}
