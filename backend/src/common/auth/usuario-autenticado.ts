import type { Rol } from '../../generated/prisma/enums.js';

/** Datos del usuario interno que viajan en el JWT y quedan en `request.user`. */
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  debeCambiarContrasena?: boolean;
}

/** Payload firmado en el token de acceso. */
export interface JwtPayload {
  sub: string;
  nombre: string;
  correo: string;
  rol: Rol;
  iat?: number;
  exp?: number;
}

export const COOKIE_ACCESO = 'vms_access';
export const COOKIE_REFRESCO = 'vms_refresh';
/** Cookie legible por el frontend solo para redirecciones optimistas por rol. */
export const COOKIE_ROL = 'vms_rol';
