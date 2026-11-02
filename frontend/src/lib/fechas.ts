const ZONA = 'America/Bogota';

const fechaHora = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA });
const soloFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: ZONA });
const soloHora = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: ZONA });

function aDate(valor: string | Date): Date {
  return typeof valor === 'string' ? new Date(valor) : valor;
}

/** "4 nov 2026, 9:00 a. m." */
export function formatearFechaHora(valor: string | Date): string {
  return fechaHora.format(aDate(valor));
}

/** "4 de noviembre de 2026" */
export function formatearFecha(valor: string | Date): string {
  return soloFecha.format(aDate(valor));
}

/** "9:00 a. m." */
export function formatearHora(valor: string | Date): string {
  return soloHora.format(aDate(valor));
}

/** "2 h 10 min" a partir de minutos */
export function formatearDuracion(minutos: number): string {
  const signo = minutos < 0 ? '−' : '';
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${signo}${m} min`;
  return m === 0 ? `${signo}${h} h` : `${signo}${h} h ${m} min`;
}

/** Valor para un <input type="datetime-local"> en hora local del navegador. */
export function aDatetimeLocal(valor: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())}T${p(valor.getHours())}:${p(valor.getMinutes())}`;
}

/** Fecha sugerida por defecto: mañana a las 9:00 */
export function mananaALas9(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}
