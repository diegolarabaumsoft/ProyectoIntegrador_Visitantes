import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('ANT-08 Bitácora (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const sesion = async (correo: string) =>
    (await http().post('/api/v1/auth/login').send({ correo, contrasena: 'Vms.2026*' }).expect(200)).headers['set-cookie'] as unknown as string[];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exporta con separador, escapes y protección contra fórmulas; limita los roles', async () => {
    // La bitácora es inmutable: esta fila de prueba permanece, marcada con un actor sintético
    const marca = `E2E-${randomUUID()}`;
    await prisma.eventoBitacora.create({ data: { tipoEvento: 'REPORTE_GENERADO', actor: marca, resultado: '=HYPERLINK("x";"y")' } });

    const dpo = await sesion('dpo@plantatextil.local');
    const r = await http().get('/api/v1/bitacora/exportar').query({ formato: 'csv', actor: marca, desde: new Date(Date.now() - 60_000).toISOString() }).set('Cookie', dpo).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="bitacora-\d{4}-\d{2}-\d{2}-hoy\.csv"$/);
    const lineas = r.text.replace('﻿', '').trim().split('\r\n');
    expect(lineas[0]).toBe('id;fechaHora;tipoEvento;actor;visitaId;entidad;entidadId;resultado;ip');
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toContain(`"'=HYPERLINK(""x"";""y"")"`);

    await new Promise((resolver) => setTimeout(resolver, 300));
    expect(await prisma.eventoBitacora.count({ where: { tipoEvento: 'REPORTE_GENERADO', entidad: 'bitacora', actor: 'Diana Datos', fechaHora: { gte: new Date(Date.now() - 10_000) } } })).toBeGreaterThan(0);

    await http().get('/api/v1/bitacora/exportar').query({ formato: 'pdf' }).set('Cookie', dpo).expect(400);
    const jefe = await sesion('carlos.ejemplo@plantatextil.local');
    await http().get('/api/v1/bitacora/exportar').set('Cookie', jefe).expect(403);
    const filtrado = await http().get('/api/v1/bitacora').query({ actor: marca }).set('Cookie', dpo).expect(200);
    expect(filtrado.body.total).toBe(1);
  });
});
