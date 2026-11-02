const UNIDADES: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Convierte duraciones tipo "15m", "8h", "72h", "30s" a milisegundos. */
export function duracionAMs(valor: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(valor.trim());
  if (!match) {
    throw new Error(`Duración inválida: "${valor}" (use por ejemplo 15m, 8h o 30s)`);
  }
  return Number(match[1]) * UNIDADES[match[2]!.toLowerCase()]!;
}

export function sumarMinutos(fecha: Date, minutos: number): Date {
  return new Date(fecha.getTime() + minutos * 60_000);
}

export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha);
  d.setMonth(d.getMonth() + meses);
  return d;
}
