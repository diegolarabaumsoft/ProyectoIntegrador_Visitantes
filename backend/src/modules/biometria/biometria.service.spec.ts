import { describe, expect, it, vi } from 'vitest';
import { BiometriaService } from './biometria.service.js';
import { MotorSimulado } from './motor-cotejo.js';

const usuario = { id: 'u1', nombre: 'Recepción', correo: 'r@x', rol: 'RECEPCION_SEGURIDAD' } as never;
const crear = (entorno: string) =>
  new BiometriaService({} as never, {} as never, { numero: vi.fn(async () => 3) } as never, { publicar: vi.fn() } as never, new MotorSimulado(), { get: () => entorno } as never);

describe('BiometriaService', () => {
  it('rechaza el motor simulado en producción', async () => {
    const servicio = crear('production');
    await expect(servicio.identificar({ formato: 'SIMULADO', plantilla: 'x', calidad: 80, pruebaVida: true }, usuario)).rejects.toMatchObject({ status: 503 });
    await expect(servicio.enrolar('v1', [], usuario)).rejects.toMatchObject({ status: 503 });
  });
});
