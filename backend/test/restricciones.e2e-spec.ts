import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CryptoService } from '../src/common/crypto/crypto.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RestriccionesService } from '../src/modules/restricciones/restricciones.service.js';

describe('ANT-01 Restricciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let restriccionesService: RestriccionesService;

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
    restriccionesService = app.get(RestriccionesService);

    // Asegurar limpieza de pruebas previas
    const cryptoService = app.get(CryptoService);
    await prisma.entradaRestriccion.updateMany({
      where: { numeroDocumentoHash: cryptoService.hashDocumento('1020304050') },
      data: { activa: false },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Flujo completo de restricción: login admin, crear, verificar psql, enmascarado en recepción, eliminar y bitácora', async () => {
    // 1. Iniciar sesión como admin
    const loginAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'admin@plantatextil.local', contrasena: 'Vms.2026*' })
      .expect(200);

    const cookieAdmin = loginAdmin.headers['set-cookie'];

    // 2. Iniciar sesión como recepción
    const loginRecep = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'recepcion@plantatextil.local', contrasena: 'Vms.2026*' })
      .expect(200);

    const cookieRecep = loginRecep.headers['set-cookie'];

    // 3. Crear entrada de restricción con documento 1020304050
    const resCrear = await request(app.getHttpServer())
      .post('/api/v1/restricciones')
      .set('Cookie', cookieAdmin)
      .send({
        numeroDocumento: '1020304050',
        nombreReferencia: 'Carlos Mendoza Test',
        motivo: 'Incumplimiento grave de normas de seguridad',
      })
      .expect(201);

    const restriccionId = resCrear.body.id;
    expect(restriccionId).toBeDefined();

    // 4. Intentar duplicar: 409 RESTRICCION_DUPLICADA
    const resDuplicado = await request(app.getHttpServer())
      .post('/api/v1/restricciones')
      .set('Cookie', cookieAdmin)
      .send({
        numeroDocumento: '1020304050',
        nombreReferencia: 'Carlos Mendoza Test',
        motivo: 'Segundo intento',
      })
      .expect(409);

    expect(resDuplicado.body.codigo).toBe('RESTRICCION_DUPLICADA');

    // 5. Comprobar en base de datos: numero_documento empieza por v1: y hash tiene 64 chars
    const enDb = await prisma.entradaRestriccion.findUnique({
      where: { id: restriccionId },
    });
    expect(enDb).not.toBeNull();
    expect(enDb!.numeroDocumento.startsWith('v1:')).toBe(true);
    expect(enDb!.numeroDocumentoHash).toHaveLength(64);
    expect(enDb!.activa).toBe(true);

    // 6. Probar servicio compartido verificar(documento)
    const coincidencia = await restriccionesService.verificar('1020304050');
    expect(coincidencia).not.toBeNull();
    expect(coincidencia!.id).toBe(restriccionId);
    expect(coincidencia!.nombreReferencia).toBe('Carlos Mendoza Test');

    // 7. GET /restricciones como Administrador -> documento descifrado completo
    const resListAdmin = await request(app.getHttpServer())
      .get('/api/v1/restricciones?q=Carlos')
      .set('Cookie', cookieAdmin)
      .expect(200);

    const itemAdmin = resListAdmin.body.datos.find((d: any) => d.id === restriccionId);
    expect(itemAdmin).toBeDefined();
    expect(itemAdmin.numeroDocumento).toBe('1020304050');

    // 8. GET /restricciones como Recepción -> documento enmascarado
    const resListRecep = await request(app.getHttpServer())
      .get('/api/v1/restricciones?q=Carlos')
      .set('Cookie', cookieRecep)
      .expect(200);

    const itemRecep = resListRecep.body.datos.find((d: any) => d.id === restriccionId);
    expect(itemRecep).toBeDefined();
    expect(itemRecep.numeroDocumento).toBe('****4050');

    // 9. Eliminar (baja lógica): DELETE responde 204
    await request(app.getHttpServer())
      .delete(`/api/v1/restricciones/${restriccionId}`)
      .set('Cookie', cookieAdmin)
      .expect(204);

    const enDbDespues = await prisma.entradaRestriccion.findUnique({
      where: { id: restriccionId },
    });
    expect(enDbDespues!.activa).toBe(false);

    // 10. Bitácora muestra evento RESTRICCION_CREADA y RESTRICCION_ELIMINADA
    const resBitacora = await request(app.getHttpServer())
      .get('/api/v1/bitacora?tipoEvento=RESTRICCION_CREADA')
      .set('Cookie', cookieAdmin)
      .expect(200);

    const eventoCreado = resBitacora.body.datos.find(
      (e: any) => e.entidad === 'restriccion' && e.entidadId === restriccionId,
    );
    expect(eventoCreado).toBeDefined();
    expect(eventoCreado.tipoEvento).toBe('RESTRICCION_CREADA');
    expect(eventoCreado.detalle.nombreReferencia).toBeUndefined();
  });
});
