import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { AdaptadorSimulado } from './adaptador-simulado.js';
import { atenderPanel } from './panel-simulador.js';
import { crearServidor } from './servidor.js';

const ORIGEN = 'https://vms.test';
const simulador = new AdaptadorSimulado();
let servidor: Server;
let url: string;
let panel: string;

before(async () => {
  servidor = await crearServidor({ puerto: 0, origenesPermitidos: [ORIGEN], lector: simulador, atenderHttp: (q, r) => atenderPanel(q, r, simulador) });
  const { port } = servidor.address() as AddressInfo;
  url = `ws://127.0.0.1:${port}`;
  panel = `http://127.0.0.1:${port}`;
});

after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

function conectar(origin?: string): Promise<WebSocket> {
  return new Promise((resolver, rechazar) => {
    const socket = new WebSocket(url, origin ? { origin } : {});
    socket.once('open', () => resolver(socket));
    socket.once('error', rechazar);
  });
}

function preguntar(socket: WebSocket, mensaje: string): Promise<Record<string, unknown>> {
  return new Promise((resolver) => {
    socket.once('message', (datos) => resolver(JSON.parse(String(datos)) as Record<string, unknown>));
    socket.send(mensaje);
  });
}

test('rechaza un origen no permitido', async () => {
  await assert.rejects(conectar('https://sitio-ajeno.test'), /401/);
});

test('rechaza una conexión sin origen', async () => {
  await assert.rejects(conectar(), /401/);
});

test('informa el estado del lector', async () => {
  const socket = await conectar(ORIGEN);
  assert.deepEqual(await preguntar(socket, '{"tipo":"estado"}'), { tipo: 'estado', modo: 'SIMULADO', conectado: true });
  socket.close();
});

test('devuelve la plantilla de una captura, sin imagen', async () => {
  const socket = await conectar(ORIGEN);
  const respuesta = await preguntar(socket, '{"tipo":"capturar","solicitudId":"s1","proposito":"IDENTIFICAR"}');
  assert.equal(respuesta['tipo'], 'captura');
  assert.equal(respuesta['solicitudId'], 's1');
  assert.equal(respuesta['formato'], 'SIMULADO');
  assert.equal('imagen' in respuesta, false);
  socket.close();
});

test('responde error ante un mensaje inválido sin cerrar la conexión', async () => {
  const socket = await conectar(ORIGEN);
  assert.equal((await preguntar(socket, 'no es json'))['codigo'], 'MENSAJE_INVALIDO');
  assert.equal((await preguntar(socket, '{"tipo":"capturar","solicitudId":"s1","proposito":"OTRO"}'))['codigo'], 'MENSAJE_INVALIDO');
  assert.equal((await preguntar(socket, '{"tipo":"estado"}'))['tipo'], 'estado');
  socket.close();
});

const configurar = (cuerpo: object) => fetch(`${panel}/simulador`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const capturar = '{"tipo":"capturar","solicitudId":"s2","proposito":"ENROLAR","dedo":"PULGAR_I"}';

test('el panel cambia la identidad y el dedo de enrolamiento define la plantilla', async () => {
  assert.equal((await configurar({ identidad: 'persona-2' })).status, 200);
  const socket = await conectar(ORIGEN);
  assert.equal((await preguntar(socket, capturar))['plantilla'], 'persona-2:PULGAR_I');
  socket.close();
});

test('el panel fuerza un escenario de fallo', async () => {
  await configurar({ escenario: 'PRUEBA_VIDA_FALLIDA' });
  const socket = await conectar(ORIGEN);
  const respuesta = await preguntar(socket, capturar);
  assert.equal(respuesta['ok'], false);
  assert.equal(respuesta['motivo'], 'PRUEBA_VIDA_FALLIDA');
  socket.close();
  await configurar({ escenario: 'NORMAL' });
});

test('el panel rechaza valores inválidos y solicitudes que no son JSON', async () => {
  assert.equal((await configurar({ escenario: 'OTRO' })).status, 422);
  const respuesta = await fetch(`${panel}/simulador`, { method: 'POST', body: '{"identidad":"x"}', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(respuesta.status, 415);
});

test('rechaza un dedo inválido', async () => {
  const socket = await conectar(ORIGEN);
  assert.equal((await preguntar(socket, '{"tipo":"capturar","solicitudId":"s","proposito":"ENROLAR","dedo":"X"}'))['codigo'], 'MENSAJE_INVALIDO');
  socket.close();
});
