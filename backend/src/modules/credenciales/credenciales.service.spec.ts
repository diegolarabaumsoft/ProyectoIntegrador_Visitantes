import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { CredencialesService } from './credenciales.service.js';

const SECRETO = 'secreto-qr-de-prueba';
const firmante = new JwtService({ secret: SECRETO });
const ahora = () => Math.floor(Date.now() / 1000);

function crear(credencial: unknown = null) {
  const eventos = { publicar: vi.fn() };
  const prisma = { credencialQr: { findUnique: vi.fn(async () => credencial) } };
  const servicio = new CredencialesService(prisma as never, {} as never, eventos as never, { get: () => SECRETO } as never);
  return { servicio, eventos };
}

const token = (extra: object = {}) => firmante.sign({ sub: 'v1', jti: 'c1', nbf: ahora() - 60, exp: ahora() + 3600, ...extra });
const vigente = { codigo: 'c1', visitaId: 'v1', activa: true, venceEn: new Date(Date.now() + 3_600_000), visita: { estado: 'PRE_REGISTRADA' } };

describe('CredencialesService.validar', () => {
  it('acepta una credencial vigente', async () => {
    const { servicio } = crear(vigente);
    expect(await servicio.validar(token())).toMatchObject({ valida: true, visitaId: 'v1' });
  });

  it.each([
    ['firma inválida', () => new JwtService({ secret: 'otro' }).sign({ sub: 'v1', jti: 'c1' }), 'FIRMA_INVALIDA'],
    ['vencida', () => token({ nbf: ahora() - 7200, exp: ahora() - 3600 }), 'VENCIDA'],
    ['aún no vigente', () => token({ nbf: ahora() + 3600, exp: ahora() + 7200 }), 'AUN_NO_VIGENTE'],
  ])('rechaza %s y lo publica', async (_n, generar, motivo) => {
    const { servicio, eventos } = crear(vigente);
    expect(await servicio.validar(generar())).toMatchObject({ valida: false, motivo });
    expect(eventos.publicar).toHaveBeenCalledOnce();
  });

  it('rechaza invalidada, inexistente y visita finalizada', async () => {
    expect(await crear({ ...vigente, activa: false }).servicio.validar(token())).toMatchObject({ motivo: 'INVALIDADA' });
    expect(await crear(null).servicio.validar(token())).toMatchObject({ motivo: 'NO_EXISTE' });
    expect(await crear({ ...vigente, visita: { estado: 'FINALIZADA' } }).servicio.validar(token())).toMatchObject({ motivo: 'VISITA_NO_ACTIVA' });
  });
});
