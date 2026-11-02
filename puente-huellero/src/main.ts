import { AdaptadorSimulado } from './adaptador-simulado.js';
import { atenderPanel } from './panel-simulador.js';
import { crearServidor } from './servidor.js';

const modo = process.env['PUENTE_MODO'] ?? 'SIMULADO';
if (modo !== 'SIMULADO') {
  throw new Error(`Modo de lector no disponible: ${modo}`);
}
if (process.env['NODE_ENV'] === 'production') {
  throw new Error('El lector simulado no puede usarse en producción');
}

const puerto = Number(process.env['PUENTE_PUERTO'] ?? 8765);
const origenesPermitidos = (process.env['PUENTE_ORIGENES'] ?? 'http://localhost:3000').split(',').map((o) => o.trim());

const lector = new AdaptadorSimulado();
await crearServidor({ puerto, origenesPermitidos, lector, atenderHttp: (solicitud, respuesta) => atenderPanel(solicitud, respuesta, lector) });
console.log(`Puente del huellero (${modo}) en ws://127.0.0.1:${puerto} · orígenes: ${origenesPermitidos.join(', ')}`);
console.log(`Panel del simulador: http://127.0.0.1:${puerto}/panel`);
