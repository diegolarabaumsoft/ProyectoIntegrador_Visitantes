import type { IncomingMessage, ServerResponse } from 'node:http';
import { ESCENARIOS, type AdaptadorSimulado, type ConfiguracionSimulador, type Escenario } from './adaptador-simulado.js';
import { DEDOS, type Dedo } from './captura-huella.js';

const TAMANO_MAXIMO_CUERPO = 512;
const IDENTIDAD_VALIDA = /^[a-z0-9-]{1,40}$/;

const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulador del huellero</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.25rem; margin-bottom: .25rem; }
  p { color: GrayText; font-size: .875rem; margin-top: 0; }
  label { display: block; font-size: .875rem; font-weight: 600; margin-top: 1rem; }
  select { display: block; width: 100%; padding: .5rem; margin-top: .25rem; font-size: 1rem; }
  output { display: block; margin-top: 1rem; font-size: .875rem; }
</style>
</head>
<body>
<h1>Simulador del huellero</h1>
<p>Solo para desarrollo. No usa huellas reales: cada identidad es una persona de prueba.</p>
<label for="identidad">Persona que coloca el dedo</label>
<select id="identidad"></select>
<label for="dedo">Dedo al identificar</label>
<select id="dedo"></select>
<label for="escenario">Escenario</label>
<select id="escenario"></select>
<output id="estado" role="status"></output>
<script>
  const IDENTIDADES = [...Array.from({ length: 6 }, (_, i) => ['persona-' + (i + 1), 'Persona de prueba ' + (i + 1)]), ['desconocida', 'Persona no enrolada']];
  const DEDOS = ${JSON.stringify(DEDOS)};
  const ESCENARIOS = { NORMAL: 'Captura normal', CALIDAD_BAJA: 'Calidad baja', PRUEBA_VIDA_FALLIDA: 'Prueba de vida fallida', LECTOR_DESCONECTADO: 'Lector desconectado' };
  const campos = {
    identidad: IDENTIDADES,
    dedo: DEDOS.map((d) => [d, d.replace('_D', ' derecho').replace('_I', ' izquierdo').replace('INDICE', 'ÍNDICE').replace('MENIQUE', 'MEÑIQUE').toLowerCase()]),
    escenario: Object.entries(ESCENARIOS),
  };
  const salida = document.getElementById('estado');
  for (const [campo, opciones] of Object.entries(campos)) {
    const lista = document.getElementById(campo);
    lista.append(...opciones.map(([valor, texto]) => new Option(texto, valor)));
    lista.addEventListener('change', async () => {
      const respuesta = await fetch('/simulador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [campo]: lista.value }) });
      salida.textContent = respuesta.ok ? 'Guardado.' : 'No se pudo guardar.';
    });
  }
  fetch('/simulador').then((r) => r.json()).then((actual) => {
    for (const campo of Object.keys(campos)) document.getElementById(campo).value = actual[campo];
  });
</script>
</body>
</html>`;

function responderJson(respuesta: ServerResponse, codigo: number, cuerpo: unknown): void {
  respuesta.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  respuesta.end(JSON.stringify(cuerpo));
}

function leerCambios(texto: string): Partial<ConfiguracionSimulador> | null {
  try {
    const { identidad, dedo, escenario } = JSON.parse(texto) as Record<string, unknown>;
    if (identidad !== undefined && !(typeof identidad === 'string' && IDENTIDAD_VALIDA.test(identidad))) return null;
    if (dedo !== undefined && !DEDOS.includes(dedo as Dedo)) return null;
    if (escenario !== undefined && !ESCENARIOS.includes(escenario as Escenario)) return null;
    return {
      ...(identidad !== undefined ? { identidad: identidad as string } : {}),
      ...(dedo !== undefined ? { dedo: dedo as Dedo } : {}),
      ...(escenario !== undefined ? { escenario: escenario as Escenario } : {}),
    };
  } catch {
    return null;
  }
}

/** Atiende /panel y /simulador. Devuelve false si la ruta no le corresponde. */
export function atenderPanel(solicitud: IncomingMessage, respuesta: ServerResponse, simulador: AdaptadorSimulado): boolean {
  if (solicitud.method === 'GET' && solicitud.url === '/panel') {
    respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' });
    respuesta.end(PAGINA);
    return true;
  }
  if (solicitud.url !== '/simulador') return false;
  if (solicitud.method === 'GET') {
    responderJson(respuesta, 200, simulador.leerConfiguracion());
    return true;
  }
  // Exigir JSON obliga a otro sitio a pasar por CORS, que este servicio nunca autoriza
  if (solicitud.method !== 'POST' || solicitud.headers['content-type'] !== 'application/json') {
    responderJson(respuesta, 415, { codigo: 'SOLICITUD_INVALIDA' });
    return true;
  }
  let cuerpo = '';
  solicitud.on('data', (parte: Buffer) => {
    cuerpo += parte.toString();
    if (cuerpo.length > TAMANO_MAXIMO_CUERPO) solicitud.destroy();
  });
  solicitud.on('end', () => {
    const cambios = leerCambios(cuerpo);
    if (!cambios) {
      responderJson(respuesta, 422, { codigo: 'CONFIGURACION_INVALIDA' });
      return;
    }
    simulador.configurar(cambios);
    responderJson(respuesta, 200, simulador.leerConfiguracion());
  });
  return true;
}
