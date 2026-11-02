import { describe, expect, it, vi } from 'vitest';
import { EppService } from './epp.service.js';

function crear(entregas: { elemento: string; entregado: boolean }[]) {
  const prisma = { visita: { findUnique: vi.fn(async () => ({ id: 'v' })) }, entregaEpp: { findMany: vi.fn(async () => entregas) } };
  const configuracion = { lista: vi.fn(async () => ['CASCO', 'GAFAS', 'NO_VALIDO']) };
  return new EppService(prisma as never, configuracion as never, { publicar: vi.fn() } as never);
}

describe('EppService.estado', () => {
  it('calcula faltantes e ignora obligatorios inválidos', async () => {
    const e = await crear([{ elemento: 'CASCO', entregado: true }, { elemento: 'GAFAS', entregado: false }]).estado('v');
    expect(e.obligatorios).toEqual(['CASCO', 'GAFAS']);
    expect(e.faltantes).toEqual(['GAFAS']);
    expect(e.completo).toBe(false);
  });

  it('está completo con todos entregados', async () => {
    expect((await crear([{ elemento: 'CASCO', entregado: true }, { elemento: 'GAFAS', entregado: true }]).estado('v')).completo).toBe(true);
  });
});
