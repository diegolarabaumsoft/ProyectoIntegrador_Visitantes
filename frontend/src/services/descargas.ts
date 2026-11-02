import { apiGet } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Abre una descarga de la API. La navegación no pasa por lib/api, así que antes
 * se hace una petición que renueva la sesión si el token venció. La pestaña se
 * abre primero para que el navegador no la bloquee.
 */
export async function abrirDescarga(ruta: string, consulta: Record<string, string | undefined> = {}): Promise<void> {
  const pestana = window.open('', '_blank');
  try {
    await apiGet('/auth/me');
    const url = new URL(`${API_URL}${ruta}`);
    for (const [clave, valor] of Object.entries(consulta)) if (valor) url.searchParams.set(clave, valor);
    if (pestana) pestana.location.href = url.toString();
  } catch (error) {
    pestana?.close();
    throw error;
  }
}

/** El día del filtro en hora de Bogotá, sin importar la zona del navegador. */
export const inicioDiaBogota = (d: string) => (d ? new Date(`${d}T00:00:00-05:00`).toISOString() : undefined);
export const finDiaBogota = (d: string) => (d ? new Date(`${d}T23:59:59.999-05:00`).toISOString() : undefined);
