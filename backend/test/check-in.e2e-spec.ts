import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CryptoService } from '../src/common/crypto/crypto.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AcsService } from '../src/integraciones/acs/acs.service.js';
import { CredencialesService } from '../src/modules/credenciales/credenciales.service.js';

const OBLIGATORIOS = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Flujo real de la fachada con ACS simulado: exprés, inducción, EPP, bloqueo, excepción y contingencia. */
describe('CL-01 Check-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let acs: AcsService;
  let cookies: string[];
  let anfitrionId: string;
  const documentos: string[] = [];

  const http = () => request(app.getHttpServer());
  const post = (ruta: string, cuerpo?: object) => http().post(`/api/v1${ruta}`).set('Cookie', cookies).send(cuerpo);

  async function crearExpres(documento: string) {
    documentos.push(documento);
    return post('/check-in/expres', {
      nombreCompleto: 'Persona Prueba E2E',
      tipoDocumento: 'CC',
      numeroDocumento: documento,
      empresa: 'Empresa Prueba',
      anfitrionId,
      motivo: 'Prueba de check-in',
      aceptaTratamiento: true,
      aceptaNda: true,
    }).expect(201);
  }

  async function completarRequisitos(visitaId: string) {
    const { body } = await http().get(`/api/v1/visitas/${visitaId}/induccion`).set('Cookie', cookies).expect(200);
    const correctas = await prisma.preguntaInduccion.findMany({ where: { activa: true } });
    expect(body.preguntas[0].respuestaCorrecta).toBeUndefined();
    await post(`/visitas/${visitaId}/induccion`, { respuestas: correctas.map((p) => ({ preguntaId: p.id, opcion: p.respuestaCorrecta })) }).expect(200);
    await post(`/visitas/${visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
  }

  const documentoNuevo = () => `9${randomInt(100_000_000, 999_999_999)}`;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    crypto = app.get(CryptoService);
    acs = app.get(AcsService);
    const login = await http().post('/api/v1/auth/login').send({ correo: 'recepcion@plantatextil.local', contrasena: 'Vms.2026*' }).expect(200);
    cookies = login.headers['set-cookie'] as unknown as string[];
    const { body } = await http().get('/api/v1/check-in/catalogos').set('Cookie', cookies).expect(200);
    anfitrionId = body.anfitriones[0].id;
  });

  afterAll(async () => {
    acs.configurarSimulado('ok');
    await prisma.entradaRestriccion.updateMany({ where: { numeroDocumentoHash: { in: documentos.map((d) => crypto.hashDocumento(d)) } }, data: { activa: false } });
    // Las visitas de prueba no quedan como presentes en la consola ni en evacuación
    await prisma.visita.updateMany({ where: { visitante: { numeroDocumentoHash: { in: documentos.map((d) => crypto.hashDocumento(d)) } }, estado: { in: ['EN_PLANTA', 'BLOQUEADA', 'PRE_REGISTRADA'] } }, data: { estado: 'FINALIZADA', horaSalida: new Date() } });
    await app.close();
  });

  it('rechaza un QR inválido sin revelar datos', async () => {
    const { body } = await post('/check-in/escanear', { codigo: 'no-es-un-token' }).expect(200);
    expect(body).toMatchObject({ resultado: 'RECHAZADO', motivo: 'FIRMA_INVALIDA' });
  });

  it('un QR válido devuelve la ficha sin cambiar de estado', async () => {
    const { body } = await crearExpres(documentoNuevo());
    const visita = await prisma.visita.findUniqueOrThrow({ where: { id: body.ficha.visita.id } });
    const codigo = await app.get(CredencialesService).tokenDeVisita(visita);
    const escaneo = await post('/check-in/escanear', { codigo: codigo! }).expect(200);
    expect(escaneo.body.resultado).toBe('VALIDA');
    expect(escaneo.body.ficha.visita.estado).toBe('PRE_REGISTRADA');
    expect(escaneo.body.ficha.requisitos.credencial.vigente).toBe(true);
  });

  it('exige confirmar la identidad', async () => {
    const { body } = await crearExpres(documentoNuevo());
    await post(`/check-in/${body.ficha.visita.id}/confirmar`, { identidadVerificada: false }).expect(400);
  });

  it('rechaza con requisitos incompletos y autoriza al completarlos; no permite repetir', async () => {
    const { body } = await crearExpres(documentoNuevo());
    const id = body.ficha.visita.id;
    const rechazo = await post(`/check-in/${id}/confirmar`, { identidadVerificada: true }).expect(200);
    expect(rechazo.body.resultado).toBe('RECHAZADO');
    expect(rechazo.body.ficha.visita.estado).toBe('PRE_REGISTRADA');

    await completarRequisitos(id);
    const ok = await post(`/check-in/${id}/confirmar`, { identidadVerificada: true, vehiculo: { placa: 'abc123' } }).expect(200);
    expect(ok.body.resultado).toBe('AUTORIZADO');
    expect(ok.body.ficha.visita.estado).toBe('EN_PLANTA');
    expect(await prisma.vehiculo.findUnique({ where: { visitaId: id } })).toMatchObject({ placa: 'ABC123' });

    const repetido = await post(`/check-in/${id}/confirmar`, { identidadVerificada: true }).expect(409);
    expect(repetido.body.codigo).toBe('VISITA_YA_EN_PLANTA');

    await esperar(300);
    const evento = await prisma.eventoBitacora.findFirst({ where: { visitaId: id, tipoEvento: 'CHECKIN_REALIZADO' } });
    expect(JSON.stringify({ resultado: evento?.resultado, detalle: evento?.detalle })).not.toContain('Persona Prueba');
    const vehiculo = await prisma.eventoBitacora.findFirstOrThrow({ where: { visitaId: id, tipoEvento: 'VEHICULO_REGISTRADO' } });
    expect(vehiculo.resultado).not.toContain('ABC123');
    expect(await prisma.notificacion.count({ where: { visitaId: id, tipo: 'AVISO_INGRESO_ANFITRION' } })).toBe(1);
  });

  it('bloquea antes del ACS, avisa una sola vez y la excepción permite continuar', async () => {
    const documento = documentoNuevo();
    const admin = await http().post('/api/v1/auth/login').send({ correo: 'admin@plantatextil.local', contrasena: 'Vms.2026*' }).expect(200);
    documentos.push(documento);
    await http().post('/api/v1/restricciones').set('Cookie', admin.headers['set-cookie'] as unknown as string[]).send({ numeroDocumento: documento, nombreReferencia: 'Referencia E2E', motivo: 'Prueba e2e' }).expect(201);

    const espia = vi.spyOn(acs, 'autorizarPaso');
    const { body } = await crearExpres(documento);
    expect(body.resultado).toBe('BLOQUEADO');
    const id = body.ficha.visita.id;
    const otraVez = await post(`/check-in/${id}/confirmar`, { identidadVerificada: true }).expect(200);
    expect(otraVez.body.resultado).toBe('BLOQUEADO');
    expect(espia).not.toHaveBeenCalled();

    await esperar(300);
    expect(await prisma.eventoBitacora.count({ where: { visitaId: id, tipoEvento: 'CHECKIN_BLOQUEADO' } })).toBe(1);

    const ficha = await post(`/visitas/${id}/excepcion`, { justificacion: 'Autorizado para reunión puntual', autorizadoPor: 'Carlos Ejemplo, Jefe de Seguridad' }).expect(201);
    expect(ficha.body.requisitos.restriccion.estado).toBe('EXCEPCION');
    expect(ficha.body.visita.estado).toBe('PRE_REGISTRADA');

    await completarRequisitos(id);
    const ok = await post(`/check-in/${id}/confirmar`, { identidadVerificada: true }).expect(200);
    expect(ok.body.resultado).toBe('AUTORIZADO');
    espia.mockRestore();
  });

  it('entra en contingencia si el ACS no responde y el paso manual es idempotente', async () => {
    const { body } = await crearExpres(documentoNuevo());
    const id = body.ficha.visita.id;
    await completarRequisitos(id);
    acs.configurarSimulado('timeout');
    const r = await post(`/check-in/${id}/confirmar`, { identidadVerificada: true }).expect(200);
    acs.configurarSimulado('ok');
    expect(r.body.resultado).toBe('CONTINGENCIA');
    expect(r.body.ficha.visita).toMatchObject({ estado: 'EN_PLANTA', modoContingencia: true });
    expect(await prisma.colaAcsPendiente.count({ where: { visitaId: id } })).toBe(1);

    const primero = await post(`/check-in/${id}/contingencia`).expect(200);
    await esperar(300);
    const segundo = await post(`/check-in/${id}/contingencia`).expect(200);
    expect(new Date(segundo.body.pasoManualEn).getTime()).toBeLessThanOrEqual(new Date(primero.body.pasoManualEn).getTime() + 1000);
    expect(await prisma.eventoBitacora.count({ where: { visitaId: id, tipoEvento: 'ACS_CONTINGENCIA', detalle: { path: ['pasoManual'], equals: true } } })).toBe(1);
    await prisma.colaAcsPendiente.deleteMany({ where: { visitaId: id } });
  });

  it('rechaza el correo de otro visitante y la inducción de una visita cerrada', async () => {
    const correo = `e2e-${randomInt(1_000_000)}@ejemplo.test`;
    const base = { nombreCompleto: 'Persona Prueba E2E', tipoDocumento: 'CC', empresa: 'Empresa Prueba', anfitrionId, motivo: 'Prueba', aceptaTratamiento: true, aceptaNda: true };
    const documento = documentoNuevo();
    documentos.push(documento);
    const creada = await post('/check-in/expres', { ...base, numeroDocumento: documento, correo }).expect(201);
    const otro = documentoNuevo();
    documentos.push(otro);
    const conflicto = await post('/check-in/expres', { ...base, numeroDocumento: otro, correo }).expect(409);
    expect(conflicto.body.codigo).toBe('CORREO_DE_OTRO_VISITANTE');

    const id = creada.body.ficha.visita.id;
    await prisma.visita.update({ where: { id }, data: { estado: 'CANCELADA' } });
    await post(`/visitas/${id}/induccion`, { respuestas: [] }).expect(409);
  });

  it('encuentra por documento y limita los roles', async () => {
    const documento = documentoNuevo();
    await crearExpres(documento);
    const { body } = await http().get('/api/v1/check-in/buscar').query({ documento }).set('Cookie', cookies).expect(200);
    expect(body).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(documento);
    const anfitrion = await http().post('/api/v1/auth/login').send({ correo: 'ana.ejemplo@plantatextil.local', contrasena: 'Vms.2026*' }).expect(200);
    await http().post('/api/v1/check-in/escanear').set('Cookie', anfitrion.headers['set-cookie'] as unknown as string[]).send({ codigo: 'x' }).expect(403);
  });
});
