import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Prueba de humo: la aplicación arranca, el endpoint público de salud
 * responde y un endpoint protegido rechaza peticiones sin JWT.
 * Requiere la base de datos de desarrollo levantada (docker compose up -d).
 */
describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/salud responde ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/salud').expect(200);
    expect(res.body.estado).toBe('ok');
    expect(res.body.baseDatos).toBe('ok');
  });

  it('GET /api/v1/bitacora sin JWT responde 401 con formato uniforme', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/bitacora').expect(401);
    expect(res.body.codigo).toBe('NO_AUTENTICADO');
    expect(res.body.ruta).toBe('/api/v1/bitacora');
  });
});
