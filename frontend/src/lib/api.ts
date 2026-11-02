import type { RespuestaError } from '@/types/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Error lanzado cuando la API responde con un estado distinto de 2xx. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly codigo: string;
  readonly detalles?: unknown;

  constructor(cuerpo: RespuestaError) {
    super(cuerpo.mensaje);
    this.name = 'ApiError';
    this.statusCode = cuerpo.statusCode;
    this.codigo = cuerpo.codigo;
    this.detalles = cuerpo.detalles;
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface OpcionesApi {
  metodo?: Metodo;
  cuerpo?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Interno: evita reintentar tras renovar la sesión */
  sinRenovar?: boolean;
}

let renovacionEnCurso: Promise<boolean> | null = null;

/** Intenta renovar la sesión una sola vez aunque varias peticiones fallen a la vez. */
async function renovarSesion(): Promise<boolean> {
  renovacionEnCurso ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      renovacionEnCurso = null;
    });
  return renovacionEnCurso;
}

function irAlLogin() {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) return;
  const destino = new URL('/login', window.location.origin);
  destino.searchParams.set('volverA', window.location.pathname);
  destino.searchParams.set('motivo', 'sesion');
  window.location.assign(destino.toString());
}

/**
 * Cliente HTTP mínimo hacia la API del VMS.
 * - Envía siempre las cookies de sesión (httpOnly) con `credentials: 'include'`.
 * - Serializa el cuerpo como JSON y convierte los errores en `ApiError`.
 * - Ante un 401 intenta renovar la sesión una vez; si falla, redirige a /login.
 */
export async function api<T>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const url = new URL(ruta.startsWith('/') ? `${API_URL}${ruta}` : `${API_URL}/${ruta}`);
  for (const [clave, valor] of Object.entries(opciones.query ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(clave, String(valor));
  }

  const respuesta = await fetch(url, {
    method: opciones.metodo ?? 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    signal: opciones.signal,
  });

  if (respuesta.status === 204) return undefined as T;

  const contenido = await respuesta.text();
  const datos = contenido ? (JSON.parse(contenido) as unknown) : undefined;

  if (!respuesta.ok) {
    const esRutaAuth = ruta.startsWith('/auth/');
    if (respuesta.status === 401 && !esRutaAuth && !opciones.sinRenovar && typeof window !== 'undefined') {
      if (await renovarSesion()) {
        return api<T>(ruta, { ...opciones, sinRenovar: true });
      }
      irAlLogin();
    }
    const error = datos as RespuestaError | undefined;
    throw new ApiError(
      error ?? {
        statusCode: respuesta.status,
        codigo: 'ERROR_DESCONOCIDO',
        mensaje: respuesta.statusText || 'Error de comunicación con el servidor',
        ruta,
        fecha: new Date().toISOString(),
      },
    );
  }

  return datos as T;
}

export const apiGet = <T>(ruta: string, query?: OpcionesApi['query']) => api<T>(ruta, { query });
export const apiPost = <T>(ruta: string, cuerpo?: unknown) => api<T>(ruta, { metodo: 'POST', cuerpo });
export const apiPut = <T>(ruta: string, cuerpo?: unknown) => api<T>(ruta, { metodo: 'PUT', cuerpo });
export const apiPatch = <T>(ruta: string, cuerpo?: unknown) => api<T>(ruta, { metodo: 'PATCH', cuerpo });
export const apiDelete = <T>(ruta: string) => api<T>(ruta, { metodo: 'DELETE' });
