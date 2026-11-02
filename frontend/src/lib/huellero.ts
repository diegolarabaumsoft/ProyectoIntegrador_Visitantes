/** Cliente del servicio puente del huellero: el navegador no accede al lector USB (sección 7.1 del documento base). */
const URL_PUENTE = process.env.NEXT_PUBLIC_PUENTE_URL ?? 'ws://127.0.0.1:8765';
const TIEMPO_LIMITE_MS = 15_000;

export type Dedo = 'PULGAR_D' | 'INDICE_D' | 'MEDIO_D' | 'ANULAR_D' | 'MENIQUE_D' | 'PULGAR_I' | 'INDICE_I' | 'MEDIO_I' | 'ANULAR_I' | 'MENIQUE_I';

export const NOMBRE_DEDO: Record<Dedo, string> = {
  PULGAR_D: 'Pulgar derecho',
  INDICE_D: 'Índice derecho',
  MEDIO_D: 'Medio derecho',
  ANULAR_D: 'Anular derecho',
  MENIQUE_D: 'Meñique derecho',
  PULGAR_I: 'Pulgar izquierdo',
  INDICE_I: 'Índice izquierdo',
  MEDIO_I: 'Medio izquierdo',
  ANULAR_I: 'Anular izquierdo',
  MENIQUE_I: 'Meñique izquierdo',
};

export interface EstadoHuellero {
  modo: 'SIMULADO' | 'SDK';
  conectado: boolean;
}

export type MotivoCapturaFallida = 'CALIDAD_BAJA' | 'PRUEBA_VIDA_FALLIDA' | 'LECTOR_DESCONECTADO';

export type ResultadoCaptura =
  | { ok: true; formato: string; plantilla: string; calidad: number; pruebaVida: boolean }
  | { ok: false; motivo: MotivoCapturaFallida };

export const MENSAJE_CAPTURA: Record<MotivoCapturaFallida, string> = {
  CALIDAD_BAJA: 'La calidad de la lectura es baja. Limpie el sensor y el dedo, e intente de nuevo.',
  PRUEBA_VIDA_FALLIDA: 'La lectura no superó la prueba de vida.',
  LECTOR_DESCONECTADO: 'El huellero está desconectado.',
};

/** Una conexión por petición: el puente no guarda estado de la sesión de la consola. */
function preguntar<T>(mensaje: Record<string, unknown>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const socket = new WebSocket(URL_PUENTE);
    const limite = window.setTimeout(() => {
      socket.close();
      rechazar(new Error('El huellero no respondió a tiempo'));
    }, TIEMPO_LIMITE_MS);
    socket.onopen = () => socket.send(JSON.stringify(mensaje));
    socket.onmessage = (evento) => {
      window.clearTimeout(limite);
      socket.close();
      const respuesta = JSON.parse(String(evento.data)) as T & { tipo: string; mensaje?: string };
      if (respuesta.tipo === 'error') rechazar(new Error(respuesta.mensaje ?? 'El huellero rechazó la solicitud'));
      else resolver(respuesta);
    };
    socket.onerror = () => {
      window.clearTimeout(limite);
      rechazar(new Error('No hay conexión con el servicio del huellero'));
    };
  });
}

export const huellero = {
  estado: () => preguntar<EstadoHuellero>({ tipo: 'estado' }),
  capturar: (proposito: 'IDENTIFICAR' | 'ENROLAR', dedo?: Dedo) =>
    preguntar<ResultadoCaptura>({ tipo: 'capturar', solicitudId: crypto.randomUUID(), proposito, ...(dedo ? { dedo } : {}) }),
};
