/**
 * Roles del VMS y su mapa de navegación. Debe mantenerse alineado con el
 * enum `Rol` del backend (backend/prisma/schema.prisma).
 *
 * Este módulo lo importa `proxy.ts`, por eso no incluye componentes ni iconos:
 * los iconos se resuelven por nombre en el shell (components/layout/shell-interno.tsx).
 */
export const ROLES = ['ANFITRION', 'RECEPCION_SEGURIDAD', 'JEFE_SEGURIDAD', 'ADMINISTRADOR', 'DPO'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  ANFITRION: 'Anfitrión',
  RECEPCION_SEGURIDAD: 'Recepción / Seguridad',
  JEFE_SEGURIDAD: 'Jefe de Seguridad',
  ADMINISTRADOR: 'Administrador VMS',
  DPO: 'Delegado de Protección de Datos',
};

/** Ruta a la que se envía a cada rol tras iniciar sesión. */
export const RUTA_INICIO: Record<Rol, string> = {
  ANFITRION: '/anfitrion',
  RECEPCION_SEGURIDAD: '/recepcion',
  JEFE_SEGURIDAD: '/seguridad/evacuacion',
  ADMINISTRADOR: '/admin',
  DPO: '/dpo',
};

/** Prefijos de ruta que cada rol puede visitar (sección 6.9 del plan). */
export const RUTAS_PERMITIDAS: Record<Rol, string[]> = {
  ANFITRION: ['/anfitrion', '/cuenta'],
  RECEPCION_SEGURIDAD: ['/recepcion', '/seguridad/evacuacion', '/cuenta'],
  JEFE_SEGURIDAD: ['/seguridad', '/admin/kpi', '/admin/restricciones', '/admin/historico', '/cuenta'],
  ADMINISTRADOR: ['/admin', '/anfitrion', '/recepcion', '/seguridad', '/cuenta'],
  DPO: ['/dpo', '/cuenta'],
};

export type IconoNavegacion =
  | 'inicio'
  | 'calendario'
  | 'invitacion'
  | 'qr'
  | 'usuarios'
  | 'salida'
  | 'alerta'
  | 'grafico'
  | 'escudo'
  | 'documento'
  | 'ajustes'
  | 'mapa'
  | 'archivo';

export interface ItemNavegacion {
  etiqueta: string;
  href: string;
  icono: IconoNavegacion;
}

/** Navegación lateral por rol, siguiendo los prototipos de Figma. */
export const NAVEGACION: Record<Rol, ItemNavegacion[]> = {
  ANFITRION: [
    { etiqueta: 'Mis visitas', href: '/anfitrion', icono: 'calendario' },
    { etiqueta: 'Nueva invitación', href: '/anfitrion/invitaciones/nueva', icono: 'invitacion' },
  ],
  RECEPCION_SEGURIDAD: [
    { etiqueta: 'Identificar visitante', href: '/recepcion', icono: 'qr' },
    { etiqueta: 'Visitantes en planta', href: '/recepcion/en-planta', icono: 'usuarios' },
    { etiqueta: 'Check-out', href: '/recepcion/check-out', icono: 'salida' },
  ],
  JEFE_SEGURIDAD: [
    { etiqueta: 'Evacuación', href: '/seguridad/evacuacion', icono: 'alerta' },
    { etiqueta: 'Tablero de KPI', href: '/admin/kpi', icono: 'grafico' },
    { etiqueta: 'Lista de restricción', href: '/admin/restricciones', icono: 'escudo' },
    { etiqueta: 'Histórico de visitas', href: '/admin/historico', icono: 'archivo' },
  ],
  ADMINISTRADOR: [
    { etiqueta: 'Tablero de KPI', href: '/admin', icono: 'grafico' },
    { etiqueta: 'Lista de restricción', href: '/admin/restricciones', icono: 'escudo' },
    { etiqueta: 'Usuarios y roles', href: '/admin/usuarios', icono: 'usuarios' },
    { etiqueta: 'Reportes y exportación', href: '/admin/reportes', icono: 'documento' },
    { etiqueta: 'Zonas', href: '/admin/zonas', icono: 'mapa' },
    { etiqueta: 'Terminales', href: '/admin/terminales', icono: 'qr' },
    { etiqueta: 'Bitácora', href: '/admin/bitacora', icono: 'archivo' },
    { etiqueta: 'Histórico', href: '/admin/historico', icono: 'calendario' },
    { etiqueta: 'Notificaciones', href: '/admin/notificaciones', icono: 'invitacion' },
    { etiqueta: 'Alertas por umbral', href: '/admin/alertas', icono: 'alerta' },
    { etiqueta: 'Configuración', href: '/admin/configuracion', icono: 'ajustes' },
  ],
  DPO: [
    { etiqueta: 'Solicitudes de datos', href: '/dpo', icono: 'documento' },
    { etiqueta: 'Política de retención', href: '/dpo/retencion', icono: 'escudo' },
    { etiqueta: 'Bitácora de accesos', href: '/dpo/bitacora', icono: 'archivo' },
  ],
};

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

export function rutaPermitida(rol: Rol, pathname: string): boolean {
  return RUTAS_PERMITIDAS[rol].some((prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`));
}
