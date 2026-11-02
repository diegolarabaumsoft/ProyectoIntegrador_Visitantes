import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { EncuestaService } from '../src/modules/check-in-out/encuesta.controller.js';
import { sumarDiasHabiles } from '../src/modules/privacidad/solicitudes.service.js';
import { AlertasService } from '../src/modules/reportes-kpi/alertas.service.js';

const NOMBRE = 'Titular Prueba Entrega';

/** ANT-06, 07, 09, 10, 11, 12, 13 y CL-05 contra la API real. */
describe('Tarjetas de cierre (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const s: Record<string, string[]> = {};
  const http = () => request(app.getHttpServer());
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
  const documento = `6${randomInt(100_000_000, 999_999_999)}`;
  let visitaId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    for (const [rol, correo] of Object.entries({ admin: 'admin', recepcion: 'recepcion', dpo: 'dpo', jefe: 'carlos.ejemplo', ana: 'ana.ejemplo', luis: 'luis.ejemplo' })) {
      const r = await http().post('/api/v1/auth/login').send({ correo: `${correo}@plantatextil.local`, contrasena: 'Vms.2026*' }).expect(200);
      s[rol] = r.headers['set-cookie'] as unknown as string[];
    }
    const ana = await prisma.usuarioInterno.findUniqueOrThrow({ where: { correo: 'ana.ejemplo@plantatextil.local' } });
    const { body } = await http()
      .post('/api/v1/check-in/expres')
      .set('Cookie', s.recepcion)
      .send({ nombreCompleto: NOMBRE, tipoDocumento: 'CC', numeroDocumento: documento, empresa: 'Empresa Entrega E2E', correo: `titular-${documento}@ejemplo.test`, anfitrionId: ana.id, motivo: 'Prueba de entrega', aceptaTratamiento: true, aceptaNda: true })
      .expect(201);
    visitaId = body.ficha.visita.id;
    const preguntas = await prisma.preguntaInduccion.findMany({ where: { activa: true } });
    await http().post(`/api/v1/visitas/${visitaId}/induccion`).set('Cookie', s.recepcion).send({ respuestas: preguntas.map((p) => ({ preguntaId: p.id, opcion: p.respuestaCorrecta })) }).expect(200);
    await http().post(`/api/v1/visitas/${visitaId}/epp`).set('Cookie', s.recepcion).send({ elementos: ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'].map((elemento) => ({ elemento, entregado: true })) }).expect(201);
    await http().post(`/api/v1/check-in/${visitaId}/confirmar`).set('Cookie', s.recepcion).send({ identidadVerificada: true }).expect(200);
    await http().post(`/api/v1/check-out/${visitaId}/confirmar`).set('Cookie', s.recepcion).send({ credencialDevuelta: true, eppDevuelto: ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'] }).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('ANT-06: histórico por documento y aislamiento del anfitrión', async () => {
    const admin = await http().get('/api/v1/visitas').query({ documento }).set('Cookie', s.admin).expect(200);
    expect(admin.body.total).toBe(1);
    const detalle = await http().get(`/api/v1/visitas/${visitaId}`).set('Cookie', s.admin).expect(200);
    expect(detalle.body.visitante.numeroDocumento).toBe(documento);
    expect(detalle.body.eventos.length).toBeGreaterThan(0);
    const propia = await http().get(`/api/v1/visitas/${visitaId}`).set('Cookie', s.ana).expect(200);
    expect(propia.body.visitante.numeroDocumento).toBe(`****${documento.slice(-4)}`);
    expect(propia.body.eventos.every((e: { ip: unknown }) => e.ip === null)).toBe(true);
    await http().get(`/api/v1/visitas/${visitaId}`).set('Cookie', s.luis).expect(404);
    await http().get(`/api/v1/bitacora/visita/${visitaId}`).set('Cookie', s.luis).expect(404);
    await http().get(`/api/v1/bitacora/visita/${visitaId}`).set('Cookie', s.ana).expect(200);
    const ajena = await http().get('/api/v1/visitas').query({ documento }).set('Cookie', s.luis).expect(200);
    expect(ajena.body.total).toBe(0);
  });

  it('ANT-10: recalcula y muestra el día con la visita incluida', async () => {
    const r = await http().post('/api/v1/kpi/recalcular').query({ fecha: hoy }).set('Cookie', s.admin).expect(200);
    expect(r.body.valores.VISITAS_DIA).toBeGreaterThan(0);
    const tablero = await http().get('/api/v1/kpi/tablero').set('Cookie', s.jefe).expect(200);
    expect(tablero.body.serie).toHaveLength(7);
    expect(tablero.body.periodo).toBe(hoy);
    await http().get('/api/v1/kpi/tablero').set('Cookie', s.recepcion).expect(403);
    await http().post('/api/v1/kpi/recalcular').query({ fecha: hoy }).set('Cookie', s.jefe).expect(403);
  });

  it('ANT-11: reporte descargable y exportación sin datos personales', async () => {
    const r = await http().post('/api/v1/reportes/generar').set('Cookie', s.admin).send({ tipo: 'VISITAS', desde: hoy, hasta: hoy }).expect(201);
    const archivo = await http().get(`/api/v1/reportes/${r.body.id}/descargar`).set('Cookie', s.admin).expect(200);
    const texto = archivo.text ?? archivo.body.toString();
    expect(texto).toContain('Empresa Entrega E2E');
    expect(texto).not.toContain(NOMBRE);
    const anonimo = await http().get('/api/v1/privacidad/exportar').set('Cookie', s.admin).expect(200);
    expect(anonimo.text).toContain('Empresa Entrega E2E');
    expect(anonimo.text).not.toContain(NOMBRE);
    expect(anonimo.text).not.toContain(documento);
    expect(anonimo.text).not.toContain('@ejemplo.test');
    await http().get('/api/v1/privacidad/exportar').set('Cookie', s.dpo).expect(403);
    await http().post('/api/v1/reportes/generar').set('Cookie', s.admin).send({ tipo: 'VISITAS', desde: hoy, hasta: '2000-01-01' }).expect(400);
  });

  it('CL-05: la alerta se dispara solo al cruzar el umbral', async () => {
    const destinatario = `alerta-${documento}@ejemplo.test`;
    const { body } = await http().post('/api/v1/alertas-umbral').set('Cookie', s.admin).send({ indicador: 'BLOQUEOS', umbral: 5, operador: 'MAYOR', destinatarios: [destinatario] }).expect(201);
    const alertas = app.get(AlertasService);
    await alertas.evaluar(hoy, new Map([['BLOQUEOS', 5]]));
    expect(await prisma.notificacion.count({ where: { destinatario } })).toBe(0);
    await alertas.evaluar(hoy, new Map([['BLOQUEOS', 6]]));
    expect(await prisma.notificacion.count({ where: { destinatario, tipo: 'ALERTA_UMBRAL' } })).toBe(1);
    await http().delete(`/api/v1/alertas-umbral/${body.id}`).set('Cookie', s.admin).expect(204);
    await http().post('/api/v1/alertas-umbral').set('Cookie', s.admin).send({ indicador: 'BLOQUEOS', umbral: 5, operador: 'MAYOR', destinatarios: ['no-es-correo'] }).expect(400);
  });

  it('ANT-09: valida por clave, limita al DPO y protege la última pregunta', async () => {
    const put = (clave: string, valor: unknown, rol = 'admin') => http().put(`/api/v1/configuracion/${clave}`).set('Cookie', s[rol]).send({ valor });
    await put('induccion_puntaje_minimo', 101).expect(422);
    await put('epp_obligatorio', ['NO_EXISTE']).expect(422);
    await put('clave_inexistente', 1).expect(404);
    await put('induccion_puntaje_minimo', 80, 'dpo').expect(403);
    await put('induccion_puntaje_minimo', 80).expect(200);
    await http().post('/api/v1/induccion/preguntas').set('Cookie', s.admin).send({ enunciado: 'Pregunta inválida', opciones: ['a', 'b'], respuestaCorrecta: 2, orden: 99 }).expect(422);
    await http().get('/api/v1/induccion/preguntas').set('Cookie', s.recepcion).expect(403);
  });

  it('ANT-07: reintenta las fallidas y rechaza lo que no se puede reenviar', async () => {
    const crear = (tipo: string) => prisma.notificacion.create({ data: { canal: 'CORREO', destinatario: `fallo-${documento}@ejemplo.test`, asunto: 'Prueba', mensaje: 'Mensaje', tipo, estado: 'FALLIDA' } });
    const reintentable = await crear('AVISO_PRUEBA');
    const r = await http().post(`/api/v1/notificaciones/${reintentable.id}/reintentar`).set('Cookie', s.admin).expect(200);
    expect(r.body.estado).toBe('ENVIADA');
    await http().post(`/api/v1/notificaciones/${reintentable.id}/reintentar`).set('Cookie', s.admin).expect(409);
    const bienvenida = await crear('BIENVENIDA_USUARIO');
    const bloqueo = await http().post(`/api/v1/notificaciones/${bienvenida.id}/reintentar`).set('Cookie', s.admin).expect(409);
    expect(bloqueo.body.codigo).toBe('NO_REINTENTABLE');
    await prisma.notificacion.deleteMany({ where: { destinatario: `fallo-${documento}@ejemplo.test` } });
  });

  it('ANT-13: el correo se envía y el enlace responde una sola vez', async () => {
    await new Promise((r) => setTimeout(r, 400));
    expect(await prisma.notificacion.count({ where: { visitaId, tipo: 'ENCUESTA_SATISFACCION', estado: 'ENVIADA' } })).toBe(1);
    const token = app.get(EncuestaService).firmar(visitaId);
    const estado = await http().get(`/api/v1/encuesta/${token}`).expect(200);
    expect(estado.body.respondida).toBe(false);
    await http().post(`/api/v1/encuesta/${token}`).send({ puntaje: 6 }).expect(400);
    await http().post(`/api/v1/encuesta/${token}`).send({ puntaje: 5 }).expect(201);
    await http().post(`/api/v1/encuesta/${token}`).send({ puntaje: 1 }).expect(410);
    expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).satisfaccion).toBe(5);
    await http().get('/api/v1/encuesta/token-falso').expect(403);
  });

  it('ANT-12: plazo hábil, consulta sin efectos y anonimización al atender', async () => {
    expect(sumarDiasHabiles(new Date('2026-11-02T12:00:00Z'), 15).toISOString().slice(0, 10)).toBe('2026-11-23');
    await http().post('/api/v1/privacidad/solicitudes').set('Cookie', s.dpo).send({ tipo: 'CONSULTA', numeroDocumento: '0000000' }).expect(404);
    await http().post('/api/v1/privacidad/solicitudes').set('Cookie', s.admin).send({ tipo: 'CONSULTA', numeroDocumento: documento }).expect(403);
    const consulta = await http().post('/api/v1/privacidad/solicitudes').set('Cookie', s.dpo).send({ tipo: 'CONSULTA', numeroDocumento: documento }).expect(201);
    await http().patch(`/api/v1/privacidad/solicitudes/${consulta.body.id}/atender`).set('Cookie', s.dpo).send({ respuesta: 'Consulta atendida' }).expect(200);
    await http().patch(`/api/v1/privacidad/solicitudes/${consulta.body.id}/atender`).set('Cookie', s.dpo).send({ respuesta: 'Otra vez' }).expect(409);
    const visita = await prisma.visita.findUniqueOrThrow({ where: { id: visitaId }, include: { visitante: true } });
    expect(visita.visitante.anonimizado).toBe(false);
    const datos = await http().get(`/api/v1/privacidad/solicitudes/${consulta.body.id}/datos`).set('Cookie', s.dpo).expect(200);
    expect(datos.body.numeroDocumento).toBe(documento);
    // Segundo registro del mismo titular, como cuando se le invita con otro correo
    const duplicado = await prisma.visitante.create({ data: { nombreCompleto: visita.visitante.nombreCompleto, tipoDocumento: 'CC', numeroDocumento: visita.visitante.numeroDocumento, numeroDocumentoHash: visita.visitante.numeroDocumentoHash, empresa: 'Otra', correo: visita.visitante.correo, correoHash: 'duplicado' } });

    const baja = await http().post('/api/v1/privacidad/solicitudes').set('Cookie', s.dpo).send({ tipo: 'ANONIMIZACION', numeroDocumento: documento }).expect(201);
    await http().patch(`/api/v1/privacidad/solicitudes/${baja.body.id}/atender`).set('Cookie', s.dpo).send({ respuesta: 'Datos anonimizados' }).expect(200);
    expect((await prisma.visitante.findUniqueOrThrow({ where: { id: visita.visitanteId } })).anonimizado).toBe(true);
    expect((await prisma.visitante.findUniqueOrThrow({ where: { id: duplicado.id } })).anonimizado).toBe(true);
    const lista = await http().get('/api/v1/privacidad/solicitudes').set('Cookie', s.dpo).expect(200);
    expect(JSON.stringify(lista.body)).not.toContain(documento);
    const retencion = await http().get('/api/v1/privacidad/retencion').set('Cookie', s.dpo).expect(200);
    await http().put('/api/v1/privacidad/retencion').set('Cookie', s.dpo).send({ retencionDias: retencion.body.retencionDias, politicaVersion: retencion.body.politicaVersion }).expect(200);
  });
});
