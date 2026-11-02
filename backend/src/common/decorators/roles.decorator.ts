import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../../generated/prisma/enums.js';

export const ROLES_PERMITIDOS = 'rolesPermitidos';

/**
 * Restringe un endpoint a uno o varios roles (RNF-07).
 * Sin este decorador, cualquier usuario autenticado puede acceder.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_PERMITIDOS, roles);
