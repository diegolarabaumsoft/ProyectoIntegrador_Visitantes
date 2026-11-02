import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AcsService } from '../src/integraciones/acs/acs.service.js';
import { ServicioCheckOut } from '../src/modules/check-in-out/check-out.service.js';
import { CredencialesService } from '../src/modules/credenciales/credenciales.service.js';

const OBLIGATORIOS = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('CL-03 Check-out (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let anfitrionId: string;
  const http = () => request(app.getHttpServer());
  const post = (ruta: string, cuerpo?: object) => http().post(`/api/v1${ruta}`).set('Cookie', cookies).send(cuerpo);

  async function crearEnPlanta(): Promise<string> {
    const { body } = await post('/check-in/expres', {
      nombreCompleto: 'Salida Prueba E2E',
      tipoDocumento: 'CC',
      numeroDocumento: `7${randomInt(100_000_000, 999_999_999)}`,
      empresa: 'Empresa Salida E2E',
      anfitrionId,
      motivo: 'Prueba de check-out',
      aceptaTratamiento: true,
      aceptaNda: true,
    }).expect(201);
    const id: string = body.ficha.visita.id;
    const preguntas = await prisma.preguntaInduccion.findMany({ where: { activa: true } });
    await post(`/visitas/${id}/induccion`, { respuestas: preguntas.map((p) => ({ preguntaId: p.id, opcion: p.respuestaCorrecta })) }).expect(200);
    await post(`/visitas/${id}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
    await post(`/check-in/${id}/confirmar`, { identidadVerificada: true }).expect(200);
    return id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const login = await http().post('/api/v1/auth/login').send({ correo: 'recepcion@plantatextil.local', contrasena: 'Vms.2026*' }).expect(200);
    cookies = login.headers['set-cookie'] as unknown as string[];
    const { body } = await http().get('/api/v1/check-in/catalogos').set('Cookie', cookies).expect(200);
    anfitrionId = body.anfitriones[0].id;
  });

  afterAll(async () => {
    app.get(AcsService).configurarSimulado('ok');
    await app.close();
  });

  it('cierra sin incidencias, invalida el QR y no permite repetir', async () => {
    const id = await crearEnPlanta();
    const visita = await prisma.visita.findUniqueOrThrow({ where: { id } });
    const codigo = await app.get(CredencialesService).tokenDeVisita(visita);

    const ficha = await post('/check-out/escanear', { codigo: codigo! }).expect(200);
    expect(ficha.body.ficha.epp).toHaveLength(4);

    const r = await post(`/check-out/${id}/confirmar`, { credencialDevuelta: true, eppDevuelto: OBLIGATORIOS }).expect(200);
    expect(r.body.incidencias).toEqual([]);
    expect(await prisma.visita.findUniqueOrThrow({ where: { id } })).toMatchObject({ estado: 'FINALIZADA' });

    const qr = await post('/check-out/escanear', { codigo: codigo! }).expect(200);
    expect(qr.body).toMatchObject({ resultado: 'RECHAZADO', motivo: 'INVALIDADA' });
    const repetido = await post(`/check-out/${id}/confirmar`, { credencialDevuelta: true, eppDevuelto: [] }).expect(409);
    expect(repetido.body.codigo).toBe('SIN_CHECKIN_ACTIVO');
    await post('/check-out/escanear', { visitaId: id }).expect(409);
  });

  it('registra la incidencia, avisa a Seguridad y encola la revocación si el ACS no responde', async () => {
    // Con el ACS caído desde el ingreso, la autorización en cola debe descartarse al salir
    app.get(AcsService).configurarSimulado('timeout');
    const id = await crearEnPlanta();
    const r = await post(`/check-out/${id}/confirmar`, { credencialDevuelta: false, eppDevuelto: ['CASCO', 'GAFAS'] }).expect(200);
    app.get(AcsService).configurarSimulado('ok');
    expect(r.body.incidencias).toEqual(['Credencial física', 'Protector auditivo', 'Botas de seguridad']);
    expect(r.body.acs.contingencia).toBe(true);
    const cola = await prisma.colaAcsPendiente.findMany({ where: { visitaId: id } });
    expect(cola).toHaveLength(1);
    expect(cola[0].payload).toMatchObject({ accion: 'REVOCAR' });
    await prisma.colaAcsPendiente.deleteMany({ where: { visitaId: id } });

    await esperar(400);
    expect(await prisma.eventoBitacora.count({ where: { visitaId: id, tipoEvento: 'INCIDENCIA_DEVOLUCION' } })).toBe(1);
    expect(await prisma.notificacion.count({ where: { visitaId: id, tipo: 'AVISO_INCIDENCIA_DEVOLUCION' } })).toBeGreaterThan(0);
    const evento = await prisma.eventoBitacora.findFirstOrThrow({ where: { visitaId: id, tipoEvento: 'CHECKOUT_REALIZADO' } });
    expect(JSON.stringify({ r: evento.resultado, d: evento.detalle })).not.toContain('Salida Prueba');
  }, 15_000);

  it('cierra las visitas vencidas sin ingreso y respeta las vigentes', async () => {
    const { body } = await post('/check-in/expres', {
      nombreCompleto: 'Vencida Prueba E2E',
      tipoDocumento: 'CC',
      numeroDocumento: `7${randomInt(100_000_000, 999_999_999)}`,
      empresa: 'Empresa Salida E2E',
      anfitrionId,
      motivo: 'Prueba de vencimiento',
      aceptaTratamiento: true,
      aceptaNda: true,
    }).expect(201);
    const id: string = body.ficha.visita.id;
    const servicio = app.get(ServicioCheckOut);

    await servicio.cerrarVisitasVencidas();
    expect((await prisma.visita.findUniqueOrThrow({ where: { id } })).estado).toBe('PRE_REGISTRADA');

    // Se envejece solo esta visita: la base es la de desarrollo y hay visitas de demostración
    await prisma.visita.update({ where: { id }, data: { fechaProgramada: new Date(Date.now() - 30 * 24 * 60 * 60_000) } });
    await servicio.cerrarVisitasVencidas();
    const cerrada = await prisma.visita.findUniqueOrThrow({ where: { id }, include: { credencial: true } });
    expect(cerrada.estado).toBe('CANCELADA');
    expect(cerrada.credencial?.activa).toBe(false);
  });
});
