import { describe, expect, it, vi } from 'vitest';
import { InduccionService } from './induccion.service.js';

const preguntas = [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, respuestaCorrecta: 0 }));

function crear(activas = preguntas) {
  const create = vi.fn(async () => ({}));
  const prisma = { preguntaInduccion: { findMany: vi.fn(async () => activas) }, induccionSeguridad: { create } };
  const configuracion = { numero: vi.fn(async (c: string) => (c === 'induccion_puntaje_minimo' ? 80 : 12)) };
  return { servicio: new InduccionService(prisma as never, configuracion as never, { publicar: vi.fn() } as never), create };
}
const respuestas = (correctas: number) => preguntas.map((p, i) => ({ preguntaId: p.id, opcion: i < correctas ? 0 : 1 }));

describe('InduccionService.evaluar', () => {
  it('aprueba en el mínimo con vigencia futura', async () => {
    const r = await crear().servicio.evaluar('v', 'visita', respuestas(4));
    expect(r).toMatchObject({ aprobada: true, puntaje: 80 });
    expect(r.venceEn!.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);
  });

  it('reprueba bajo el mínimo sin vigencia', async () => {
    const { servicio, create } = crear();
    expect(await servicio.evaluar('v', 'visita', respuestas(3))).toMatchObject({ aprobada: false, puntaje: 60, venceEn: null });
    expect(create).toHaveBeenCalledOnce();
  });

  it('exige responder todas y que haya preguntas', async () => {
    await expect(crear().servicio.evaluar('v', 'visita', respuestas(5).slice(0, 2))).rejects.toThrow();
    await expect(crear([]).servicio.evaluar('v', 'visita', [])).rejects.toThrow();
  });
});
