/** Nombres de cookie que emite el backend. Deben coincidir con backend/src/common/auth/usuario-autenticado.ts */
export const COOKIE_ACCESO = 'vms_access';
export const COOKIE_REFRESCO = 'vms_refresh';
/** Cookie no httpOnly con el rol, solo para redirecciones optimistas en proxy.ts. */
export const COOKIE_ROL = 'vms_rol';
