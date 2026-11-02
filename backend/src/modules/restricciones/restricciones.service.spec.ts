import { describe, expect, it, vi } from 'vitest';
import { RestriccionesService } from './restricciones.service.js';

describe('RestriccionesService.verificar', () => {
  it('busca por hash del documento y solo entre las activas', async () => {
    const findFirst = vi.fn(async () => ({ id: 'r1', nombreReferencia: 'x', motivo: 'y', fechaRegistro: new Date() }));
    const hashDocumento = vi.fn(() => 'HASH');
    const servicio = new RestriccionesService({ entradaRestriccion: { findFirst } } as never, { hashDocumento } as never, {} as never, {} as never);
    expect(await servicio.verificar('1020304050')).toMatchObject({ id: 'r1' });
    expect(hashDocumento).toHaveBeenCalledWith('1020304050');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { numeroDocumentoHash: 'HASH', activa: true } }));
  });

  it('devuelve null sin coincidencia', async () => {
    const servicio = new RestriccionesService({ entradaRestriccion: { findFirst: vi.fn(async () => null) } } as never, { hashDocumento: () => 'H' } as never, {} as never, {} as never);
    expect(await servicio.verificar('1')).toBeNull();
  });
});
