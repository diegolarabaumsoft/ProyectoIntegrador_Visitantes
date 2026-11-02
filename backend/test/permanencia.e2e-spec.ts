import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PermanenciaService } from '../src/modules/permanencia/permanencia.service.js';

describe('ANT-05 Permanencia (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let visitaId: string;
  const http = () => request(app.getHttpServer());

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
    const { body: catalogos } = await http().get('/api/v1/check-in/catalogos').set('Cookie', cookies).expect(200);
    const { body } = await http()
      .post('/api/v1/check-in/expres')
      .set('Cookie', cookies)
      .send({
        nombreCompleto: 'Presente Prueba E2E',
        tipoDocumento: 'CC',
        numeroDocumento: `8${randomInt(100_000_000, 999_999_999)}`,
        empresa: 'Empresa Presentes E2E',
        anfitrionId: catalogos.anfitriones[0].id,
        motivo: 'Prueba de permanencia',
        aceptaTratamiento: true,
        aceptaNda: true,
      })
      .expect(201);
    visitaId = body.ficha.visita.id;
    await prisma.visita.update({ where: { id: visitaId }, data: { estado: 'EN_PLANTA', horaIngreso: new Date(Date.now() - 300 * 60_000), tiempoAutorizadoMin: 240 } });
    app.get(PermanenciaService).invalidarPresentes();
  });

  afterAll(async () => {
    await prisma.visita.update({ where: { id: visitaId }, data: { estado: 'FINALIZADA', horaSalida: new Date() } });
    await app.close();
  });

  it('lista la visita excedida con tiempo negativo y filtra por empresa', async () => {
    const { body } = await http().get('/api/v1/permanencia/presentes').query({ q: 'presentes e2e' }).set('Cookie', cookies).expect(200);
    expect(body.total).toBe(1);
    expect(body.presentes[0]).toMatchObject({ visitaId, excedido: true, zonaActual: null, minutosRestantes: -60 });
    const vacio = await http().get('/api/v1/permanencia/presentes').query({ q: 'no-existe-xyz' }).set('Cookie', cookies).expect(200);
    expect(vacio.body.total).toBe(0);
  });

  it('exige acompañante, cierra el movimiento anterior y registra la salida', async () => {
    const zonas = await prisma.zona.findMany({ where: { activa: true } });
    const conAcompanante = zonas.find((z) => z.requiereAcompanante)!;
    const libre = zonas.find((z) => !z.requiereAcompanante)!;
    const post = (zonaId: string) => http().post(`/api/v1/visitas/${visitaId}/movimientos`).set('Cookie', cookies).send({ zonaId });

    const rechazo = await post(conAcompanante.id).expect(422);
    expect(rechazo.body.codigo).toBe('REQUIERE_ACOMPANANTE');

    const primero = await post(libre.id).expect(201);
    const acompanante = await prisma.usuarioInterno.findFirstOrThrow({ where: { correo: 'carlos.ejemplo@plantatextil.local' } });
    await http().patch(`/api/v1/visitas/${visitaId}/acompanante`).set('Cookie', cookies).send({ acompananteId: acompanante.id }).expect(200);
    const segundo = await post(conAcompanante.id).expect(201);

    expect((await prisma.movimientoZona.findUniqueOrThrow({ where: { id: primero.body.id } })).horaSalida).not.toBeNull();
    const { body } = await http().get('/api/v1/permanencia/presentes').query({ q: 'presentes e2e' }).set('Cookie', cookies).expect(200);
    expect(body.presentes[0].zonaActual.movimientoId).toBe(segundo.body.id);

    await http().patch(`/api/v1/visitas/${visitaId}/movimientos/${segundo.body.id}/salida`).set('Cookie', cookies).expect(200);
    await http().patch(`/api/v1/visitas/${visitaId}/movimientos/${segundo.body.id}/salida`).set('Cookie', cookies).expect(409);
  });

  it('registra el vehículo sin escribir la placa en la bitácora y limita los roles', async () => {
    await http().patch(`/api/v1/visitas/${visitaId}/vehiculo`).set('Cookie', cookies).send({ placa: 'xyz987', tipo: 'Camión' }).expect(200);
    expect(await prisma.vehiculo.findUnique({ where: { visitaId } })).toMatchObject({ placa: 'XYZ987' });
    await new Promise((r) => setTimeout(r, 300));
    const eventos = await prisma.eventoBitacora.findMany({ where: { visitaId, tipoEvento: 'VEHICULO_REGISTRADO' } });
    expect(eventos).toHaveLength(1);
    expect(JSON.stringify({ r: eventos[0].resultado, d: eventos[0].detalle })).not.toContain('XYZ987');

    const anfitrion = await http().post('/api/v1/auth/login').send({ correo: 'ana.ejemplo@plantatextil.local', contrasena: 'Vms.2026*' }).expect(200);
    await http().get('/api/v1/permanencia/presentes').set('Cookie', anfitrion.headers['set-cookie'] as unknown as string[]).expect(403);
  });
});
