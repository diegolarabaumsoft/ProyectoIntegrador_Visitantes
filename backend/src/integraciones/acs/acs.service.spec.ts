import { describe, expect, it, vi } from 'vitest';
import type { Visita } from '../../generated/prisma/client.js';
import { AcsService } from './acs.service.js';
import { AdaptadorAcsSimulado } from './adaptador-acs-simulado.service.js';
import type { ComportamientoSimulado } from './control-acceso-fisico.js';

/** Pruebas unitarias sin base de datos: Prisma, configuración y eventos simulados. */

function crearEntorno(comportamiento: ComportamientoSimulado, timeoutMs = 50) {
  const adaptador = new AdaptadorAcsSimulado({ get: () => comportamiento } as never);
  const cola: { id: string; visitaId: string; payload: unknown; creadoEn: Date; intentos: number; enviadoEn: Date | null; error: string | null }[] = [];
  const prisma = {
    colaAcsPendiente: {
      create: vi.fn(async ({ data }: { data: { visitaId: string; payload: unknown; intentos: number; error: string } }) => {
        const fila = { id: `cola-${cola.length + 1}`, creadoEn: new Date(), enviadoEn: null, ...data };
        cola.push(fila);
        return fila;
      }),
      count: vi.fn(async () => cola.filter((c) => c.enviadoEn === null).length),
      findMany: vi.fn(async () => cola.filter((c) => c.enviadoEn === null)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const fila = cola.find((c) => c.id === where.id)!;
        if (data['enviadoEn']) fila.enviadoEn = data['enviadoEn'] as Date;
        if (data['intentos']) fila.intentos += 1;
        if ('error' in data) fila.error = data['error'] as string | null;
        return fila;
      }),
    },
  };
  const configuracion = { numero: vi.fn(async () => timeoutMs) };
  const eventos = { publicar: vi.fn() };
  const servicio = new AcsService(adaptador, prisma as never, configuracion as never, eventos as never);
  return { servicio, adaptador, cola, eventos };
}

const visita = { id: '11111111-2222-4333-8444-555555555555' } as Visita;

describe('AcsService', () => {
  it('autoriza el paso cuando el ACS responde y registra ACS_AUTORIZADO', async () => {
    const { servicio, eventos, cola } = crearEntorno('ok');
    const r = await servicio.autorizarPaso(visita, 'Rosa Recepción');
    expect(r).toMatchObject({ autorizado: true, contingencia: false });
    expect(r.referenciaAcs).toMatch(/^SIM-/);
    expect(cola).toHaveLength(0);
    expect(eventos.publicar).toHaveBeenCalledWith('vms.acs.autorizado', expect.objectContaining({ tipo: 'ACS_AUTORIZADO', visitaId: visita.id }));
  });

  it('activa la contingencia y encola cuando el ACS no responde en el tiempo límite', async () => {
    const { servicio, eventos, cola } = crearEntorno('timeout', 40);
    const r = await servicio.autorizarPaso(visita, 'Rosa Recepción');
    expect(r).toMatchObject({ autorizado: false, contingencia: true });
    expect(r.detalle).toContain('no respondió');
    expect(cola).toHaveLength(1);
    expect(cola[0]!.payload).toEqual({ accion: 'AUTORIZAR', referencia: expect.stringMatching(/^VMS-/) });
    expect(eventos.publicar).toHaveBeenCalledWith('vms.acs.contingencia', expect.objectContaining({ tipo: 'ACS_CONTINGENCIA' }));
  });

  it('encola también cuando el ACS devuelve un error explícito', async () => {
    const { servicio, cola } = crearEntorno('error');
    const r = await servicio.revocarPaso(visita, 'SISTEMA');
    expect(r.contingencia).toBe(true);
    expect(r.detalle).toContain('error');
    expect(cola[0]!.payload).toEqual(expect.objectContaining({ accion: 'REVOCAR' }));
  });

  it('reenvía las pendientes cuando el ACS se recupera y publica ACS_RECONCILIADO', async () => {
    const { servicio, adaptador, eventos, cola } = crearEntorno('timeout', 40);
    await servicio.autorizarPaso(visita, 'Rosa Recepción');
    expect(cola[0]!.enviadoEn).toBeNull();

    adaptador.configurar('ok');
    const resultado = await servicio.reenviarPendientes();
    expect(resultado).toEqual({ reenviadas: 1, fallidas: 0 });
    expect(cola[0]!.enviadoEn).toBeInstanceOf(Date);
    expect(eventos.publicar).toHaveBeenCalledWith('vms.acs.reconciliado', expect.objectContaining({ tipo: 'ACS_RECONCILIADO', visitaId: visita.id }));
    expect((await servicio.estado()).pendientes).toBe(0);
  });

  it('si el ACS sigue caído, incrementa intentos y deja la cola intacta', async () => {
    const { servicio, cola } = crearEntorno('timeout', 40);
    await servicio.autorizarPaso(visita, 'Rosa Recepción');
    const resultado = await servicio.reenviarPendientes();
    expect(resultado).toEqual({ reenviadas: 0, fallidas: 1 });
    expect(cola[0]!.intentos).toBe(2);
    expect(cola[0]!.enviadoEn).toBeNull();
  });

  it('expone el estado con el modo y el comportamiento del simulador', async () => {
    const { servicio } = crearEntorno('ok', 3000);
    expect(servicio.configurarSimulado('error')).toBe(true);
    const estado = await servicio.estado();
    expect(estado).toMatchObject({ modo: 'simulado', comportamiento: 'error', timeoutMs: 3000, pendientes: 0 });
  });
});
