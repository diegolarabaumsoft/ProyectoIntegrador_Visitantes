import bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

const VALORES: Record<string, unknown> = { LOGIN_MAX_INTENTOS: 5, LOGIN_BLOQUEO_MIN: 30, JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '8h' };

async function crear(cambios: object = {}) {
  const usuario = { id: 'u', nombre: 'Ana', correo: 'a@x.co', rol: 'ANFITRION', activo: true, intentosFallidos: 0, bloqueadoHasta: null, hashContrasena: await bcrypt.hash('Correcta-123', 4), ...cambios };
  const update = vi.fn(async () => usuario);
  const prisma = { usuarioInterno: { findUnique: vi.fn(async () => usuario), update }, refreshToken: { create: vi.fn(async () => ({})) } };
  const eventos = { publicar: vi.fn() };
  const servicio = new AuthService(prisma as never, { sign: () => 'jwt', signAsync: async () => 'jwt' } as never, { tokenAleatorio: () => 't', hashToken: () => 'h' } as never, eventos as never, { numero: async (c: string) => (c === 'login_max_intentos' ? 5 : 30) } as never, { get: (k: string) => VALORES[k] } as never);
  return { servicio, update, eventos };
}

describe('AuthService.login', () => {
  it('cuenta los intentos y da un error genérico', async () => {
    const { servicio, update } = await crear({ intentosFallidos: 1 });
    await expect(servicio.login('a@x.co', 'Incorrecta-1')).rejects.toMatchObject({ response: { codigo: 'CREDENCIALES_INVALIDAS' } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { intentosFallidos: 2, bloqueadoHasta: null } }));
  });

  it('bloquea al quinto intento fallido', async () => {
    const { servicio, update, eventos } = await crear({ intentosFallidos: 4 });
    await expect(servicio.login('a@x.co', 'Incorrecta-1')).rejects.toMatchObject({ response: { codigo: 'CUENTA_BLOQUEADA' } });
    const datos = (update.mock.calls[0] as unknown as [{ data: { bloqueadoHasta: Date } }])[0].data;
    expect(datos.bloqueadoHasta.getTime()).toBeGreaterThan(Date.now());
    expect(eventos.publicar).toHaveBeenCalledTimes(2);
  });

  it('no revela si la cuenta existe cuando está inactiva', async () => {
    const { servicio } = await crear({ activo: false });
    await expect(servicio.login('a@x.co', 'Correcta-123')).rejects.toMatchObject({ response: { codigo: 'CREDENCIALES_INVALIDAS' } });
  });
});
