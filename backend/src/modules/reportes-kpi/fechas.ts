/** Bogotá no tiene horario de verano: los días de negocio se delimitan a −05:00. */
export const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00.000-05:00`);
export const finDia = (fecha: string) => new Date(`${fecha}T23:59:59.999-05:00`);
/** AAAA-MM-DD del instante en hora de Bogotá (sv-SE usa ese formato). */
export const diaBogota = (fecha: Date) => fecha.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
/** Suma días a un AAAA-MM-DD. */
export const sumarDias = (fecha: string, dias: number) => new Date(new Date(`${fecha}T12:00:00.000Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10);
