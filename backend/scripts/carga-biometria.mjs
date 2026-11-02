// Carga de la identificación 1:N (HU-07, menos de 2 s). Requiere la API en marcha, con terminales y motor simulados.
// Uso: API=http://localhost:3001/api/v1 CONTRASENA=... node scripts/carga-biometria.mjs [galeria] [lecturas]
// Con el motor simulado mide la API, el descifrado y la consulta, no el costo del cotejo real (BIO-11).
const API = process.env.API ?? 'http://localhost:3001/api/v1';
const CONTRASENA = process.env.CONTRASENA ?? 'Vms.2026*';
const GALERIA = Number(process.argv[2] ?? 100);
const LECTURAS = Number(process.argv[3] ?? 50);

const inicioSesion = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: 'recepcion@plantatextil.local', contrasena: CONTRASENA }) });
if (!inicioSesion.ok) throw new Error(`login ${inicioSesion.status}`);
const cookie = inicioSesion.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

const pedir = async (ruta, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`${ruta} ${r.status}: ${await r.text()}`);
  return r.json();
};
const percentil = (v, p) => [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil((p / 100) * v.length) - 1)] ?? 0;

const { anfitriones } = await pedir('/check-in/catalogos');
const marca = Date.now();
const personas = [];
for (let i = 0; i < GALERIA; i++) {
  const { ficha } = await pedir('/check-in/expres', { nombreCompleto: `Carga Biometria ${i}`, tipoDocumento: 'CC', numeroDocumento: `5${marca}${i}`, empresa: 'Carga', anfitrionId: anfitriones[0].id, motivo: 'Carga biometría', aceptaTratamiento: true, aceptaNda: true, autorizaBiometria: true });
  const persona = `carga-${marca}-${i}`;
  const muestras = ['INDICE_D', 'INDICE_I'].flatMap((dedo) => [1, 2, 3].map(() => ({ dedo, formato: 'SIMULADO', plantilla: `${persona}:${dedo}`, calidad: 80, pruebaVida: true })));
  await pedir(`/biometria/visitas/${ficha.visita.id}/enrolamiento`, { identidadConfirmada: true, muestras });
  personas.push(persona);
}

const tiempos = [];
let coincidencias = 0;
for (let i = 0; i < LECTURAS; i++) {
  const inicio = performance.now();
  const r = await pedir('/biometria/identificacion', { formato: 'SIMULADO', plantilla: `${personas[i % personas.length]}:INDICE_D`, calidad: 80, pruebaVida: true });
  tiempos.push(performance.now() - inicio);
  if (r.resultado === 'COINCIDE') coincidencias++;
}
console.log(JSON.stringify({ galeria: GALERIA, plantillas: GALERIA * 2, lecturas: LECTURAS, coincidencias, p50ms: Math.round(percentil(tiempos, 50)), p90ms: Math.round(percentil(tiempos, 90)), maxMs: Math.round(Math.max(...tiempos)) }));
