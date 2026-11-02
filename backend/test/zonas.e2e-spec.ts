import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

// Nombre sintético: la base es la de desarrollo y «Tintorería» es una zona del seed
const NOMBRE = 'Zona Prueba E2E';

describe('ANT-02 Zonas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.zona.deleteMany({ where: { nombre: { equals: NOMBRE, mode: 'insensitive' } } });
  });

  afterAll(async () => {
    await prisma.zona.deleteMany({ where: { nombre: NOMBRE } });
    await app.close();
  });

  it('Flujo completo de zonas: crear sensible con acompañante, rechazar duplicada 409, desactivar y filtrar activa=true', async () => {
    // 1. Iniciar sesión como admin
    const loginAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'admin@plantatextil.local', contrasena: 'Vms.2026*' })
      .expect(200);

    const cookieAdmin = loginAdmin.headers['set-cookie'];

    // 2. Iniciar sesión como anfitrión (rol interno) para comprobar lectura
    const loginAnfitrion = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'ana.ejemplo@plantatextil.local', contrasena: 'Vms.2026*' })
      .expect(200);

    const cookieAnfitrion = loginAnfitrion.headers['set-cookie'];

    // 3. Crear zona zona sensible con acompañante
    const resCrear = await request(app.getHttpServer())
      .post('/api/v1/zonas')
      .set('Cookie', cookieAdmin)
      .send({
        nombre: NOMBRE,
        esSensible: true,
        requiereAcompanante: true,
      })
      .expect(201);

    const zonaId = resCrear.body.id;
    expect(zonaId).toBeDefined();
    expect(resCrear.body.nombre).toBe(NOMBRE);
    expect(resCrear.body.esSensible).toBe(true);
    expect(resCrear.body.requiereAcompanante).toBe(true);
    expect(resCrear.body.activa).toBe(true);

    // 4. Intentar crear otra zona «Tintorería» (mismo nombre) -> 409 ZONA_DUPLICADA
    const resDuplicada = await request(app.getHttpServer())
      .post('/api/v1/zonas')
      .set('Cookie', cookieAdmin)
      .send({
        nombre: NOMBRE,
        esSensible: false,
        requiereAcompanante: false,
      })
      .expect(409);

    expect(resDuplicada.body.codigo).toBe('ZONA_DUPLICADA');

    // También insensible a mayúsculas: minúsculas -> 409
    const resDuplicadaMinuscula = await request(app.getHttpServer())
      .post('/api/v1/zonas')
      .set('Cookie', cookieAdmin)
      .send({
        nombre: NOMBRE.toLowerCase(),
      })
      .expect(409);

    expect(resDuplicadaMinuscula.body.codigo).toBe('ZONA_DUPLICADA');

    // 5. Lectura por rol interno (anfitrión) lista la zona
    const resListarActivas = await request(app.getHttpServer())
      .get('/api/v1/zonas?activa=true')
      .set('Cookie', cookieAnfitrion)
      .expect(200);

    const encontrada = resListarActivas.body.find((z: any) => z.id === zonaId);
    expect(encontrada).toBeDefined();

    // 6. Desactivar zona -> PATCH /zonas/:id/desactivar
    const resDesactivar = await request(app.getHttpServer())
      .patch(`/api/v1/zonas/${zonaId}/desactivar`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(resDesactivar.body.activa).toBe(false);

    // 7. Comprobar que GET /zonas?activa=true YA NO la lista
    const resListarDespues = await request(app.getHttpServer())
      .get('/api/v1/zonas?activa=true')
      .set('Cookie', cookieAnfitrion)
      .expect(200);

    const noEncontrada = resListarDespues.body.find((z: any) => z.id === zonaId);
    expect(noEncontrada).toBeUndefined();

    // Pero GET /zonas (sin filtro) sí la devuelve como inactiva
    const resListarTodas = await request(app.getHttpServer())
      .get('/api/v1/zonas')
      .set('Cookie', cookieAdmin)
      .expect(200);

    const enTodas = resListarTodas.body.find((z: any) => z.id === zonaId);
    expect(enTodas).toBeDefined();
    expect(enTodas.activa).toBe(false);
  });
});
