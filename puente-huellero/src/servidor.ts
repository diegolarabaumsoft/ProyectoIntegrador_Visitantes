import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEDOS, type Dedo, type ICapturaHuella, type PropositoCaptura } from './captura-huella.js';

/** Los mensajes de la consola son órdenes cortas; una plantilla nunca viaja hacia el puente. */
const TAMANO_MAXIMO_MENSAJE = 1024;
const PROPOSITOS: readonly string[] = ['IDENTIFICAR', 'ENROLAR'] satisfies PropositoCaptura[];

export interface OpcionesServidor {
  puerto: number;
  origenesPermitidos: string[];
  lector: ICapturaHuella;
  /** Rutas HTTP adicionales (panel del simulador). Devuelve false si no las atiende. */
  atenderHttp?: (solicitud: IncomingMessage, respuesta: ServerResponse) => boolean;
}

function enviar(socket: WebSocket, mensaje: Record<string, unknown>): void {
  socket.send(JSON.stringify(mensaje));
}

function leerMensaje(datos: unknown): Record<string, unknown> | null {
  try {
    const mensaje: unknown = JSON.parse(String(datos));
    return typeof mensaje === 'object' && mensaje !== null ? (mensaje as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function atender(socket: WebSocket, datos: unknown, lector: ICapturaHuella): Promise<void> {
  const mensaje = leerMensaje(datos);
  if (mensaje?.['tipo'] === 'estado') {
    enviar(socket, { tipo: 'estado', ...lector.estado() });
    return;
  }
  const dedo = mensaje?.['dedo'];
  const dedoValido = dedo === undefined || DEDOS.includes(dedo as Dedo);
  if (mensaje?.['tipo'] === 'capturar' && typeof mensaje['solicitudId'] === 'string' && PROPOSITOS.includes(String(mensaje['proposito'])) && dedoValido) {
    const resultado = await lector.capturar(mensaje['proposito'] as PropositoCaptura, dedo as Dedo | undefined);
    enviar(socket, { tipo: 'captura', solicitudId: mensaje['solicitudId'], ...resultado });
    return;
  }
  enviar(socket, { tipo: 'error', codigo: 'MENSAJE_INVALIDO', mensaje: 'Mensaje no reconocido' });
}

/**
 * Expone el lector a la consola web. Escucha solo en la interfaz local y valida
 * el encabezado Origin: sin esa validación, cualquier sitio abierto en el equipo
 * de recepción podría pedir capturas al huellero.
 */
export function crearServidor({ puerto, origenesPermitidos, lector, atenderHttp }: OpcionesServidor): Promise<Server> {
  const permitidos = new Set(origenesPermitidos);
  const servidor = createServer((solicitud, respuesta) => {
    if (atenderHttp?.(solicitud, respuesta)) return;
    respuesta.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Este servicio solo acepta conexiones WebSocket');
  });
  const websocket = new WebSocketServer({
    server: servidor,
    maxPayload: TAMANO_MAXIMO_MENSAJE,
    verifyClient: ({ origin }: { origin?: string }) => origin !== undefined && permitidos.has(origin),
  });

  websocket.on('connection', (socket) => {
    socket.on('error', () => socket.terminate());
    socket.on('message', (datos) => {
      atender(socket, datos, lector).catch(() => {
        enviar(socket, { tipo: 'error', codigo: 'LECTOR_ERROR', mensaje: 'El lector no respondió' });
      });
    });
  });

  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, '127.0.0.1', () => resolver(servidor));
  });
}
