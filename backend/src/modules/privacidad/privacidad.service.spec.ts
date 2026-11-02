import { describe, expect, it, vi } from 'vitest';
import { ACTOR_SISTEMA } from '../../eventos/eventos.js';
import { PrivacidadService, VisitaActivaError } from './privacidad.service.js';

function crearEntorno(visitas: { id: string; estado: string }[]) {
  const visitante = { id: 'vis-1', anonimizado: false, visitas };
  const escrituras: Record<string, unknown>[] = [];
  const prisma = {
    visitante: {
      findUnique: vi.fn(async () => visitante),
      update: vi.fn((args: Record<string, unknown>) => (escrituras.push({ visitante: args }), Promise.resolve(visitante))),
      findMany: vi.fn(async () => [{ id: 'vis-1' }]),
    },
    vehiculo: { deleteMany: vi.fn((args: unknown) => (escrituras.push({ vehiculo: args }), Promise.resolve({ count: 1 }))) },
    induccionSeguridad: { updateMany: vi.fn((args: unknown) => (escrituras.push({ induccion: args }), Promise.resolve({ count: 1 }))) },
    notificacion: { updateMany: vi.fn((args: unknown) => (escrituras.push({ notificacion: args }), Promise.resolve({ count: 3 }))) },
    consentimiento: { updateMany: vi.fn((args: unknown) => (escrituras.push({ consentimiento: args }), Promise.resolve({ count: 1 }))) },
    plantillaBiometrica: { count: vi.fn(async () => 0), deleteMany: vi.fn((args: unknown) => (escrituras.push({ plantillas: args }), Promise.resolve({ count: 2 }))) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const crypto = { cifrar: vi.fn(() => 'v1:marcador') };
  const configuracion = { numero: vi.fn(async () => 365) };
  const eventos = { publicar: vi.fn() };
  const servicio = new PrivacidadService(prisma as never, crypto as never, configuracion as never, eventos as never);
  return { servicio, prisma, eventos, escrituras };
}

describe('PrivacidadService', () => {
  it('anonimiza datos personales, vehículos, respuestas y destinatarios de correo', async () => {
    const { servicio, escrituras, eventos } = crearEntorno([{ id: 'v1', estado: 'FINALIZADA' }, { id: 'v2', estado: 'CANCELADA' }]);
    const r = await servicio.anonimizarVisitante('vis-1', ACTOR_SISTEMA, 'RETENCION');
    expect(r).toEqual({ visitanteId: 'vis-1', visitasAfectadas: 2, notificacionesAfectadas: 3, plantillasEliminadas: 2 });

    const cambioVisitante = (escrituras.find((e) => 'visitante' in e)!['visitante'] as { data: Record<string, unknown> }).data;
    expect(cambioVisitante).toMatchObject({ anonimizado: true, numeroDocumentoHash: '', correoHash: '', telefono: null, nombreCompleto: 'v1:marcador' });
    expect(escrituras.some((e) => 'vehiculo' in e)).toBe(true);
    expect(escrituras.some((e) => 'plantillas' in e)).toBe(true);
    expect(eventos.publicar).toHaveBeenCalledWith('vms.biometria.plantilla.purgada', expect.objectContaining({ tipo: 'PLANTILLA_PURGADA', entidadId: 'vis-1', detalle: { motivo: 'RETENCION', cantidad: 2 } }));
    expect((escrituras.find((e) => 'notificacion' in e)!['notificacion'] as { data: { destinatario: string } }).data.destinatario).toBe('anonimizado');
    expect(eventos.publicar).toHaveBeenCalledWith(
      'vms.privacidad.anonimizacion',
      expect.objectContaining({ tipo: 'ANONIMIZACION_RETENCION', actor: 'SISTEMA', entidadId: 'vis-1', detalle: expect.objectContaining({ motivo: 'RETENCION' }) }),
    );
  });

  it('rechaza anonimizar si hay una visita programada o en curso', async () => {
    const { servicio, eventos } = crearEntorno([{ id: 'v1', estado: 'EN_PLANTA' }]);
    await expect(servicio.anonimizarVisitante('vis-1', ACTOR_SISTEMA, 'RETENCION')).rejects.toBeInstanceOf(VisitaActivaError);
    expect(eventos.publicar).not.toHaveBeenCalled();
  });

  it('la tarea de retención anonimiza a los candidatos y cuenta los omitidos', async () => {
    const { servicio } = crearEntorno([{ id: 'v1', estado: 'FINALIZADA' }]);
    const r = await servicio.ejecutarRetencion();
    expect(r).toEqual({ anonimizados: 1, omitidos: 0 });
    const estado = await servicio.estadoRetencion();
    expect(estado.retencionDias).toBe(365);
    expect(estado.ultimaEjecucion).toBeInstanceOf(Date);
  });
});
