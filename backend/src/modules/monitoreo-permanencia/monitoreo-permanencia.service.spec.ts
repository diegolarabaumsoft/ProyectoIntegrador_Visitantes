import { describe, expect, it, vi } from 'vitest';
import { MonitoreoPermanenciaService } from './monitoreo-permanencia.service.js';

const AHORA = new Date('2026-11-04T18:00:00Z');

function visita(id: string, minutosDesdeIngreso: number, tiempoAutorizadoMin: number, alertada = false) {
  return {
    id,
    estado: 'EN_PLANTA',
    horaIngreso: new Date(AHORA.getTime() - minutosDesdeIngreso * 60_000),
    tiempoAutorizadoMin,
    alertaPermanenciaEn: alertada ? AHORA : null,
    visitante: { id: `vis-${id}`, anonimizado: false },
    anfitrion: { nombre: 'Ana Ejemplo' },
  };
}

function crearEntorno(visitas: ReturnType<typeof visita>[]) {
  const prisma = {
    visita: {
      findMany: vi.fn(async () => visitas.filter((v) => v.alertaPermanenciaEn === null)),
      updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const v = visitas.find((x) => x.id === where.id)!;
        if (v.alertaPermanenciaEn) return { count: 0 };
        v.alertaPermanenciaEn = AHORA;
        return { count: 1 };
      }),
    },
  };
  const visitantes = { resumen: vi.fn(() => ({ id: 'x', nombreCompleto: 'Laura Comercial', empresa: 'Textiles del Norte', correo: 'l@x.com' })) };
  const eventos = { publicar: vi.fn() };
  const servicio = new MonitoreoPermanenciaService(prisma as never, visitantes as never, eventos as never);
  return { servicio, eventos, prisma };
}

describe('MonitoreoPermanenciaService', () => {
  it('alerta solo las visitas que superaron el tiempo autorizado', async () => {
    const { servicio, eventos } = crearEntorno([
      visita('a', 300, 240), // excedida en 60 min
      visita('b', 100, 240), // dentro del tiempo
      visita('c', 241, 240), // excedida en 1 min
    ]);
    const r = await servicio.revisarPermanencia(AHORA);
    expect(r.revisadas).toBe(3);
    expect(r.alertadas).toEqual(['a', 'c']);
    expect(eventos.publicar).toHaveBeenCalledTimes(2);
    expect(eventos.publicar).toHaveBeenCalledWith(
      'vms.permanencia.alerta',
      expect.objectContaining({ tipo: 'ALERTA_PERMANENCIA', visitaId: 'a', minutosExcedidos: 60, nombreVisitante: 'Laura Comercial' }),
    );
  });

  it('no repite la alerta en revisiones posteriores', async () => {
    const { servicio, eventos } = crearEntorno([visita('a', 300, 240)]);
    await servicio.revisarPermanencia(AHORA);
    const segunda = await servicio.revisarPermanencia(new Date(AHORA.getTime() + 120_000));
    expect(segunda.alertadas).toEqual([]);
    expect(eventos.publicar).toHaveBeenCalledTimes(1);
  });

  it('no escribe datos personales en el detalle del evento', async () => {
    const { servicio, eventos } = crearEntorno([visita('a', 300, 240)]);
    await servicio.revisarPermanencia(AHORA);
    const detalle = JSON.stringify(eventos.publicar.mock.calls[0]![1].detalle);
    expect(detalle).not.toContain('Laura');
    expect(detalle).not.toContain('Textiles');
  });
});
