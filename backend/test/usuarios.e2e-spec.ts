import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const MAILPIT = 'http://localhost:8026/api/v1';

/** La contraseña temporal solo existe en el correo: se lee de Mailpit. */
async function contrasenaEnCorreo(correo: string): Promise<string> {
  const busqueda = (await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${correo}`)}`)).json()) as { messages: { ID: string }[] };
  const mensaje = (await (await fetch(`${MAILPIT}/message/${busqueda.messages[0].ID}`)).json()) as { HTML: string };
  return /data-contrasena="([^"]+)"/.exec(mensaje.HTML)![1];
}

describe('ANT-04 Usuarios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string[];
  const correo = `e2e-${randomInt(1_000_000_000)}@plantatextil.local`;
  const nueva = 'Contrasena-Nueva-2026';
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const login = await http().post('/api/v1/auth/login').send({ correo: 'admin@plantatextil.local', contrasena: 'Vms.2026*' }).expect(200);
    admin = login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await prisma.usuarioInterno.deleteMany({ where: { correo } });
    await app.close();
  });

  it('crea, permite entrar con la contraseña temporal, desactiva y corta la sesión', async () => {
    const creado = await http().post('/api/v1/usuarios').set('Cookie', admin).send({ nombre: 'Usuario E2E', correo: correo.toUpperCase(), rol: 'ANFITRION', area: 'Pruebas' }).expect(201);
    expect(creado.body).toMatchObject({ correo, rol: 'ANFITRION', area: 'Pruebas', correoEnviado: true });
    expect(creado.body.hashContrasena).toBeUndefined();
    await http().post('/api/v1/usuarios').set('Cookie', admin).send({ nombre: 'Otro', correo, rol: 'DPO' }).expect(409);

    const contrasena = await contrasenaEnCorreo(correo);
    const notificacion = await prisma.notificacion.findFirstOrThrow({ where: { destinatario: correo } });
    expect(JSON.stringify(notificacion)).not.toContain(contrasena);

    const login = await http().post('/api/v1/auth/login').send({ correo, contrasena }).expect(200);
    const sesion = login.headers['set-cookie'] as unknown as string[];
    const temporal = await http().get('/api/v1/usuarios/anfitriones').set('Cookie', sesion).expect(403);
    expect(temporal.body.codigo).toBe('CONTRASENA_TEMPORAL');
    await http().post('/api/v1/auth/cambiar-contrasena').set('Cookie', sesion).send({ actual: 'incorrecta-123', nueva }).expect(422);
    await http().post('/api/v1/auth/cambiar-contrasena').set('Cookie', sesion).send({ actual: contrasena, nueva: 'corta' }).expect(400);
    await http().post('/api/v1/auth/cambiar-contrasena').set('Cookie', sesion).send({ actual: contrasena, nueva }).expect(204);
    await http().get('/api/v1/auth/me').set('Cookie', sesion).expect(200);
    await http().get('/api/v1/usuarios').set('Cookie', sesion).expect(403);
    const anfitriones = await http().get('/api/v1/usuarios/anfitriones').set('Cookie', sesion).expect(200);
    expect(anfitriones.body.some((a: { nombre: string; correo?: string }) => a.nombre === 'Usuario E2E' && a.correo === undefined)).toBe(true);

    await http().patch(`/api/v1/usuarios/${creado.body.id}/desactivar`).set('Cookie', admin).expect(200);
    await http().get('/api/v1/auth/me').set('Cookie', sesion).expect(401);
    await http().post('/api/v1/auth/login').send({ correo, contrasena: nueva }).expect(401);
    expect(await prisma.refreshToken.count({ where: { usuarioId: creado.body.id, revocado: false } })).toBe(0);

    await http().patch(`/api/v1/usuarios/${creado.body.id}/reactivar`).set('Cookie', admin).expect(200);
    await http().post('/api/v1/auth/login').send({ correo, contrasena }).expect(401);
    await http().post('/api/v1/auth/login').send({ correo, contrasena: nueva }).expect(200);
  });

  it('el rol no anfitrión pierde el área y el administrador no puede quitarse acceso', async () => {
    const usuario = await prisma.usuarioInterno.findUniqueOrThrow({ where: { correo } });
    const editado = await http().patch(`/api/v1/usuarios/${usuario.id}`).set('Cookie', admin).send({ rol: 'DPO' }).expect(200);
    expect(editado.body).toMatchObject({ rol: 'DPO', area: null });

    const yo = await prisma.usuarioInterno.findUniqueOrThrow({ where: { correo: 'admin@plantatextil.local' } });
    const desactivar = await http().patch(`/api/v1/usuarios/${yo.id}/desactivar`).set('Cookie', admin).expect(409);
    expect(desactivar.body.codigo).toBe('NO_PUEDE_DESACTIVARSE');
    await http().patch(`/api/v1/usuarios/${yo.id}`).set('Cookie', admin).send({ rol: 'DPO' }).expect(409);
  });
});
