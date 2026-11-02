// Prueba de carga ligera (RNF-01, sección 8.4). Requiere la API en marcha.
// Uso: API=http://localhost:3001/api/v1 CONTRASENA=... node scripts/carga.mjs [flujos] [concurrencia]
// Crea visitas exprés con documentos sintéticos y las deja cerradas con check-out.
const API = process.env.API ?? 'http://localhost:3001/api/v1';
const CONTRASENA = process.env.CONTRASENA ?? 'Vms.2026*';
const FLUJOS = Number(process.argv[2] ?? 20);
const CONCURRENCIA = Number(process.argv[3] ?? 4);
const EPP = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];

async function sesion(correo) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, contrasena: CONTRASENA }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const percentil = (v, p) => [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil((p / 100) * v.length) - 1)] ?? 0;

const cookie = await sesion('recepcion@plantatextil.local');
const pedir = async (ruta, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`${ruta} ${r.status}: ${await r.text()}`);
  return r.json();
};

const { anfitriones } = await pedir('/check-in/catalogos');
const prueba = await sesion('admin@plantatextil.local');
const preguntas = await (await fetch(`${API}/induccion/preguntas`, { headers: { Cookie: prueba } })).json();
const respuestas = preguntas.filter((p) => p.activa).map((p) => ({ preguntaId: p.id, opcion: p.respuestaCorrecta }));

const tiempos = [];
async function flujo(i) {
  const documento = `5${String(Date.now()).slice(-8)}${i}`;
  const { ficha } = await pedir('/check-in/expres', { nombreCompleto: 'Carga Sintetica', tipoDocumento: 'CC', numeroDocumento: documento, empresa: 'Prueba de carga', anfitrionId: anfitriones[0].id, motivo: 'Prueba de carga', aceptaTratamiento: true, aceptaNda: true });
  const id = ficha.visita.id;
  await pedir(`/visitas/${id}/induccion`, { respuestas });
  await pedir(`/visitas/${id}/epp`, { elementos: EPP.map((elemento) => ({ elemento, entregado: true })) });
  const inicio = performance.now();
  await pedir(`/visitas/${id}/requisitos`);
  const r = await pedir(`/check-in/${id}/confirmar`, { identidadVerificada: true });
  tiempos.push(performance.now() - inicio);
  if (r.resultado !== 'AUTORIZADO') throw new Error(`resultado ${r.resultado}`);
  return id;
}

const inicioTotal = performance.now();
const ids = [];
for (let i = 0; i < FLUJOS; i += CONCURRENCIA) {
  ids.push(...(await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, FLUJOS - i) }, (_, j) => flujo(i + j)))));
}
const presentes = [];
for (let i = 0; i < 10; i++) {
  const t = performance.now();
  await pedir('/permanencia/presentes');
  presentes.push(performance.now() - t);
}
for (const id of ids) await pedir(`/check-out/${id}/confirmar`, { credencialDevuelta: true, eppDevuelto: EPP });

console.log(JSON.stringify({ flujos: FLUJOS, concurrencia: CONCURRENCIA, checkInMs: { promedio: Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length), p90: Math.round(percentil(tiempos, 90)) }, presentesMs: { p90: Math.round(percentil(presentes, 90)) }, totalS: Math.round((performance.now() - inicioTotal) / 1000) }));
