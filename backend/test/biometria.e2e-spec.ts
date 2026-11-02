import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CryptoService } from '../src/common/crypto/crypto.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { KpiService } from '../src/modules/reportes-kpi/kpi.service.js';
import { PrivacidadService } from '../src/modules/privacidad/privacidad.service.js';
import { TerminalesService } from '../src/modules/terminales/terminales.service.js';
import { VisitantesService } from '../src/modules/visitantes/visitantes.service.js';

const esperar = () => new Promise((r) => setTimeout(r, 100));
const muestras = (identidad: string, cambios: object = {}) =>
  ['INDICE_D', 'INDICE_I'].flatMap((dedo) =>
    [1, 2, 3].map(() => ({ dedo, formato: 'SIMULADO', plantilla: `${identidad}:${dedo}`, calidad: 80, pruebaVida: true, ...cambios })),
  );

/** BIO-03 y BIO-04: autorización biométrica, credencial según el caso y enrolamiento. */
describe('Biometría (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let visitantes: VisitantesService;
  let anfitrionId: string;

  const http = () => request(app.getHttpServer());
  const documentoNuevo = () => `8${randomInt(100_000_000, 999_999_999)}`;

  /** Visita con el enlace activo: el token real solo viaja en el correo. */
  async function crearVisita() {
    const token = randomUUID();
    const documento = documentoNuevo();
    const visitante = await visitantes.crearOActualizar({ nombreCompleto: 'Persona Biometria E2E', empresa: 'Empresa Prueba', correo: `${documento}@ejemplo.test` });
    const visita = await prisma.visita.create({
      data: {
        visitanteId: visitante.id,
        anfitrionId,
        fechaProgramada: new Date(),
        motivo: 'Prueba biométrica',
        tiempoAutorizadoMin: 60,
        tokenEnlaceHash: crypto.hashToken(token),
        vencimientoEnlace: new Date(Date.now() + 3_600_000),
      },
    });
    await http().put(`/api/v1/pre-registro/${token}/datos`).send({ nombreCompleto: 'Persona Biometria E2E', tipoDocumento: 'CC', numeroDocumento: documento, empresa: 'Empresa Prueba', correo: `${documento}@ejemplo.test` }).expect(200);
    return { token, visitaId: visita.id, visitanteId: visitante.id };
  }

  async function aprobarInduccion(token: string) {
    const correctas = await prisma.preguntaInduccion.findMany({ where: { activa: true } });
    await http().post(`/api/v1/pre-registro/${token}/induccion`).send({ respuestas: correctas.map((p) => ({ preguntaId: p.id, opcion: p.respuestaCorrecta })) }).expect(200);
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    crypto = app.get(CryptoService);
    visitantes = app.get(VisitantesService);
    anfitrionId = (await prisma.usuarioInterno.findUniqueOrThrow({ where: { correo: 'ana.ejemplo@plantatextil.local' } })).id;
  });

  afterAll(async () => {
    await prisma.terminalBiometrico.deleteMany({ where: { OR: [{ nombre: { startsWith: 'Terminal E2E ' } }, { nombre: { startsWith: 'Caida E2E ' } }] } });
    await prisma.visita.updateMany({ where: { motivo: 'Prueba biométrica', estado: 'EN_PLANTA' }, data: { estado: 'FINALIZADA', horaSalida: new Date() } });
    await app.close();
  });

  // Una sesión por rol: el límite de intentos de inicio de sesión también aplica a las pruebas
  const sesiones = new Map<string, string[]>();
  async function iniciarSesion(correo: string) {
    const existente = sesiones.get(correo);
    if (existente) return existente;
    const r = await http().post('/api/v1/auth/login').send({ correo, contrasena: 'Vms.2026*' }).expect(200);
    const cookies = r.headers['set-cookie'] as unknown as string[];
    sesiones.set(correo, cookies);
    return cookies;
  }

  async function visitaConHuellaAutorizada() {
    const datos = await crearVisita();
    await http().post(`/api/v1/pre-registro/${datos.token}/consentimiento`).send({ aceptaTratamiento: true, aceptaNda: true, autorizaBiometria: true }).expect(200);
    await aprobarInduccion(datos.token);
    await http().post(`/api/v1/pre-registro/${datos.token}/finalizar`).expect(200);
    return datos;
  }

  it('HU-04 y HU-05: sin autorización se emite el QR', async () => {
    const { token, visitaId } = await crearVisita();
    await http().post(`/api/v1/pre-registro/${token}/consentimiento`).send({ aceptaTratamiento: true, aceptaNda: true }).expect(200);
    expect((await prisma.consentimiento.findUniqueOrThrow({ where: { visitaId } })).autorizaBiometria).toBe(false);
    await aprobarInduccion(token);
    const { body } = await http().post(`/api/v1/pre-registro/${token}/finalizar`).expect(200);
    expect(body.codigoQr).toEqual(expect.any(String));
    expect(body.estado.paso).toBe('CREDENCIAL');
  });

  it('HU-04 y HU-05: con autorización no se emite QR y queda la constancia', async () => {
    const { token, visitaId } = await crearVisita();
    await http().post(`/api/v1/pre-registro/${token}/consentimiento`).send({ aceptaTratamiento: true, aceptaNda: true, autorizaBiometria: true }).expect(200);
    const consentimiento = await prisma.consentimiento.findUniqueOrThrow({ where: { visitaId } });
    expect(consentimiento.autorizaBiometria).toBe(true);
    expect(consentimiento.versionTextoBiometrico).toBe(consentimiento.versionPolitica);
    await aprobarInduccion(token);
    const { body } = await http().post(`/api/v1/pre-registro/${token}/finalizar`).expect(200);
    expect(body.codigoQr).toBeNull();
    expect(body.estado.paso).toBe('HUELLA');
    expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).estado).toBe('PRE_REGISTRADA');
    expect(await prisma.credencialQr.count({ where: { visitaId } })).toBe(0);
    await http().get(`/api/v1/pre-registro/${token}/credencial`).expect(404);
    expect((await http().get(`/api/v1/pre-registro/${token}`).expect(200)).body.paso).toBe('HUELLA');
  });

  describe('HU-37: enrolamiento', () => {
    let recepcion: string[];
    const enrolar = (visitaId: string, cuerpo: object) => http().post(`/api/v1/biometria/visitas/${visitaId}/enrolamiento`).set('Cookie', recepcion).send(cuerpo);
    const identidad = () => `persona-${randomUUID()}`;

    beforeAll(async () => {
      recepcion = await iniciarSesion('recepcion@plantatextil.local');
    });

    it('guarda dos dedos cifrados y nunca devuelve la plantilla', async () => {
      const { visitaId, visitanteId } = await visitaConHuellaAutorizada();
      const persona = identidad();
      const { body } = await enrolar(visitaId, { identidadConfirmada: true, muestras: muestras(persona) }).expect(201);
      expect(body.dedos).toHaveLength(2);
      const guardadas = await prisma.plantillaBiometrica.findMany({ where: { visitanteId } });
      expect(guardadas).toHaveLength(2);
      for (const p of guardadas) expect(p.datoCifrado).not.toContain(persona);
      expect(crypto.descifrar(guardadas[0].datoCifrado)).toContain(persona);
      expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).identidadVerificada).toBe(true);

      const estado = await http().get(`/api/v1/biometria/visitas/${visitaId}`).set('Cookie', recepcion).expect(200);
      expect(estado.body.plantillas).toHaveLength(2);
      expect(JSON.stringify(estado.body)).not.toContain(persona);
      expect(JSON.stringify(estado.body)).not.toContain('datoCifrado');
      await new Promise((r) => setTimeout(r, 50));
      const eventos = await prisma.eventoBitacora.findMany({ where: { visitaId, tipoEvento: 'HUELLA_ENROLADA' } });
      expect(eventos).toHaveLength(1);
      expect(JSON.stringify([eventos[0].resultado, eventos[0].detalle])).not.toContain(persona);
    });

    it('exige documento, autorización, muestras completas, vida y calidad', async () => {
      const { visitaId } = await visitaConHuellaAutorizada();
      const persona = identidad();
      await enrolar(visitaId, { identidadConfirmada: false, muestras: muestras(persona) }).expect(400);
      expect((await enrolar(visitaId, { identidadConfirmada: true, muestras: muestras(persona).slice(1) }).expect(422)).body.codigo).toBe('MUESTRAS_INCOMPLETAS');
      expect((await enrolar(visitaId, { identidadConfirmada: true, muestras: muestras(persona, { pruebaVida: false }) }).expect(422)).body.codigo).toBe('PRUEBA_VIDA_FALLIDA');
      expect((await enrolar(visitaId, { identidadConfirmada: true, muestras: muestras(persona, { calidad: 10 }) }).expect(422)).body.codigo).toBe('CALIDAD_BAJA');
      expect((await enrolar(visitaId, { identidadConfirmada: true, muestras: muestras(persona, { formato: 'OTRO' }) }).expect(422)).body.codigo).toBe('FORMATO_NO_SOPORTADO');
      const inconsistentes = muestras(persona);
      inconsistentes[0] = { ...inconsistentes[0], plantilla: 'otra', calidad: 90 };
      expect((await enrolar(visitaId, { identidadConfirmada: true, muestras: inconsistentes }).expect(422)).body.codigo).toBe('MUESTRAS_INCONSISTENTES');

      const sinAutorizar = await crearVisita();
      await http().post(`/api/v1/pre-registro/${sinAutorizar.token}/consentimiento`).send({ aceptaTratamiento: true, aceptaNda: true }).expect(200);
      expect((await enrolar(sinAutorizar.visitaId, { identidadConfirmada: true, muestras: muestras(persona) }).expect(409)).body.codigo).toBe('SIN_AUTORIZACION_BIOMETRICA');
    });

    it('rechaza una huella ya registrada para otra persona y solo recepción puede enrolar', async () => {
      const persona = identidad();
      const primera = await visitaConHuellaAutorizada();
      await enrolar(primera.visitaId, { identidadConfirmada: true, muestras: muestras(persona) }).expect(201);
      const segunda = await visitaConHuellaAutorizada();
      expect((await enrolar(segunda.visitaId, { identidadConfirmada: true, muestras: muestras(persona) }).expect(409)).body.codigo).toBe('HUELLA_DUPLICADA');

      const admin = await iniciarSesion('admin@plantatextil.local');
      await http().post(`/api/v1/biometria/visitas/${segunda.visitaId}/enrolamiento`).set('Cookie', admin).send({ identidadConfirmada: true, muestras: muestras(identidad()) }).expect(403);
      await http().get(`/api/v1/biometria/visitas/${segunda.visitaId}`).set('Cookie', admin).expect(403);
    });
  });

  describe('HU-07, HU-40: identificación y credencial alternativa', () => {
    let recepcion: string[];
    const OBLIGATORIOS = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];
    const api = (ruta: string, cuerpo?: object) => http().post(`/api/v1${ruta}`).set('Cookie', recepcion).send(cuerpo);
    const identificar = (plantilla: string) => api('/biometria/identificacion', { formato: 'SIMULADO', plantilla, calidad: 80, pruebaVida: true });
    const ficha = async (visitaId: string) => (await http().get(`/api/v1/visitas/${visitaId}/requisitos`).set('Cookie', recepcion).expect(200)).body;

    async function enrolada(desfaseMin = 11) {
      const datos = await visitaConHuellaAutorizada();
      const persona = `persona-${randomUUID()}`;
      await api(`/biometria/visitas/${datos.visitaId}/enrolamiento`, { identidadConfirmada: true, muestras: muestras(persona) }).expect(201);
      // Fuera de la vigencia del enrolamiento: debe identificarse con el dedo
      await prisma.plantillaBiometrica.updateMany({ where: { visitanteId: datos.visitanteId }, data: { fechaEnrolamiento: new Date(Date.now() - desfaseMin * 60_000) } });
      await api(`/visitas/${datos.visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      return { ...datos, persona };
    }

    beforeAll(async () => {
      recepcion = await iniciarSesion('recepcion@plantatextil.local');
    });

    it('identifica, autoriza por huella y registra el método sin credencial que devolver', async () => {
      const { visitaId, persona } = await enrolada();
      expect((await ficha(visitaId)).requisitos.identificacion).toEqual({ metodo: null, autorizaBiometria: true, enrolada: true });
      expect((await api(`/check-in/${visitaId}/confirmar`, { identidadVerificada: true }).expect(200)).body.resultado).toBe('RECHAZADO');

      const { body } = await identificar(`${persona}:INDICE_I`).expect(200);
      expect(body).toMatchObject({ resultado: 'COINCIDE', visitaId, intentosMaximos: 3 });
      expect((await ficha(visitaId)).requisitos.identificacion.metodo).toBe('HUELLA');

      const confirmado = await api(`/check-in/${visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      expect(confirmado.body.resultado).toBe('AUTORIZADO');
      expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).metodoIdentificacion).toBe('HUELLA');

      const salida = await api('/check-out/escanear', { visitaId }).expect(200);
      expect(salida.body.ficha?.tieneCredencial ?? salida.body.tieneCredencial).toBe(false);
      await api(`/check-out/${visitaId}/confirmar`, { credencialDevuelta: false, eppDevuelto: OBLIGATORIOS }).expect(200);
      await esperar();
      expect(await prisma.eventoBitacora.count({ where: { visitaId, tipoEvento: 'INCIDENCIA_DEVOLUCION' } })).toBe(0);
    });

    it('registra rechazos sin identificar a nadie ni exponer plantillas', async () => {
      const desconocida = `persona-${randomUUID()}`;
      expect((await identificar(desconocida).expect(200)).body).toEqual({ resultado: 'NO_COINCIDE', intentosMaximos: 3 });
      expect((await api('/biometria/identificacion', { motivo: 'PRUEBA_VIDA_FALLIDA' }).expect(200)).body.resultado).toBe('PRUEBA_VIDA_FALLIDA');
      expect((await api('/biometria/identificacion', { formato: 'SIMULADO', plantilla: desconocida, calidad: 10, pruebaVida: true }).expect(200)).body.resultado).toBe('CALIDAD_BAJA');
      await api('/biometria/identificacion', { formato: 'OTRO', plantilla: desconocida, calidad: 80, pruebaVida: true }).expect(422);
      await esperar();
      const eventos = await prisma.eventoBitacora.findMany({ where: { tipoEvento: { in: ['COTEJO_FALLIDO', 'PRUEBA_VIDA_FALLIDA'] } }, orderBy: { fechaHora: 'desc' }, take: 5 });
      expect(JSON.stringify(eventos.map((e) => [e.resultado, e.detalle]))).not.toContain(desconocida);
    });

    it('excluye de la galería a otra fecha o a quien no autorizó en esta visita', async () => {
      const otraFecha = await enrolada();
      await prisma.visita.update({ where: { id: otraFecha.visitaId }, data: { fechaProgramada: new Date(Date.now() + 3 * 86_400_000) } });
      expect((await identificar(`${otraFecha.persona}:INDICE_D`).expect(200)).body.resultado).toBe('NO_COINCIDE');

      const retirada = await enrolada();
      await prisma.consentimiento.update({ where: { visitaId: retirada.visitaId }, data: { autorizaBiometria: false } });
      expect((await identificar(`${retirada.persona}:INDICE_D`).expect(200)).body.resultado).toBe('NO_COINCIDE');
    });

    it('al enrolar en la primera visita queda identificado', async () => {
      const { visitaId } = await enrolada(0);
      expect((await ficha(visitaId)).requisitos.identificacion.metodo).toBe('HUELLA');
    });

    it('la credencial alternativa da ingreso con las mismas validaciones', async () => {
      const { visitaId } = await enrolada();
      await api(`/check-in/${visitaId}/credencial-alternativa`, { motivo: 'OTRO' }).expect(400);
      const emitida = await api(`/check-in/${visitaId}/credencial-alternativa`, { motivo: 'HUELLA_ILEGIBLE' }).expect(200);
      expect(emitida.body.requisitos.identificacion.metodo).toBe('CREDENCIAL_ALTERNATIVA');
      expect(emitida.body.requisitos.completos).toBe(true);
      await api(`/check-in/${visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).metodoIdentificacion).toBe('CREDENCIAL_ALTERNATIVA');
      await api(`/check-in/${visitaId}/credencial-alternativa`, { motivo: 'HUELLA_ILEGIBLE' }).expect(409);
      await esperar();
      expect(await prisma.eventoBitacora.count({ where: { visitaId, tipoEvento: 'CREDENCIAL_EMITIDA' } })).toBe(1);
      await api(`/check-out/${visitaId}/confirmar`, { credencialDevuelta: true, eppDevuelto: OBLIGATORIOS }).expect(200);
    });

    it('HU-11: el registro exprés con huella no emite credencial', async () => {
      const documento = documentoNuevo();
      const { body } = await api('/check-in/expres', { nombreCompleto: 'Expres Huella E2E', tipoDocumento: 'CC', numeroDocumento: documento, empresa: 'Empresa', anfitrionId, motivo: 'Prueba exprés', aceptaTratamiento: true, aceptaNda: true, autorizaBiometria: true }).expect(201);
      expect(body.ficha.requisitos.credencial.vigente).toBe(false);
      expect(body.ficha.requisitos.identificacion).toEqual({ metodo: null, autorizaBiometria: true, enrolada: false });
      await api(`/biometria/visitas/${body.ficha.visita.id}/enrolamiento`, { identidadConfirmada: true, muestras: muestras(`persona-${randomUUID()}`) }).expect(201);
      expect((await ficha(body.ficha.visita.id)).requisitos.identificacion.metodo).toBe('HUELLA');
    });
  });

  describe('HU-09, HU-12, HU-13, HU-14, HU-34: terminales', () => {
    let recepcion: string[];
    let admin: string[];
    const OBLIGATORIOS = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];
    const api = (ruta: string, cuerpo?: object, cookies = recepcion) => http().post(`/api/v1${ruta}`).set('Cookie', cookies).send(cuerpo);
    const terminal = (nombre: string) => prisma.terminalBiometrico.findUniqueOrThrow({ where: { nombre } });
    const pasar = async (nombre: string, visitaId: string) => api(`/terminales/${(await terminal(nombre)).id}/simular-paso`, { visitaId });
    const presente = async (visitaId: string) => {
      const { body } = await http().get('/api/v1/permanencia/presentes').set('Cookie', recepcion).expect(200);
      return (body.presentes as { visitaId: string; sinPaso: boolean }[]).find((p) => p.visitaId === visitaId);
    };
    const fueraDeLinea = async (nombre: string, enLinea: boolean) => http().patch(`/api/v1/terminales/${(await terminal(nombre)).id}/simulado`).set('Cookie', admin).send({ enLinea }).expect(200);

    async function enPlanta(extra: object = {}) {
      const datos = await visitaConHuellaAutorizada();
      await api(`/biometria/visitas/${datos.visitaId}/enrolamiento`, { identidadConfirmada: true, muestras: muestras(`persona-${randomUUID()}`) }).expect(201);
      await api(`/visitas/${datos.visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      const confirmado = await api(`/check-in/${datos.visitaId}/confirmar`, { identidadVerificada: true, ...extra }).expect(200);
      return { ...datos, confirmado: confirmado.body };
    }

    beforeAll(async () => {
      recepcion = await iniciarSesion('recepcion@plantatextil.local');
      admin = await iniciarSesion('admin@plantatextil.local');
    });

    it('carga la plantilla en entrada y salida, y queda autorizado sin paso hasta el terminal', async () => {
      const { visitaId, confirmado } = await enPlanta();
      expect(confirmado.resultado).toBe('AUTORIZADO');
      const autorizaciones = await prisma.autorizacionTerminal.findMany({ where: { visitaId }, include: { terminal: true } });
      expect(autorizaciones.map((a) => a.terminal.tipo).sort()).toEqual(['ENTRADA', 'SALIDA']);
      expect(autorizaciones.every((a) => a.estado === 'CARGADA')).toBe(true);
      expect((await presente(visitaId))?.sinPaso).toBe(true);

      expect((await pasar('Torniquete de entrada', visitaId)).status).toBe(200);
      await esperar();
      expect((await presente(visitaId))?.sinPaso).toBe(false);
      expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).ingresoFisicoEn).not.toBeNull();
    });

    it('la salida por terminal cierra la visita, revoca y registra el EPP pendiente', async () => {
      const { visitaId } = await enPlanta();
      await api(`/check-out/${visitaId}/devolucion`, { credencialDevuelta: false, eppDevuelto: ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO'] }).expect(200);
      expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).estado).toBe('EN_PLANTA');

      const salida = await pasar('Torniquete de salida', visitaId);
      expect(salida.status).toBe(200);
      expect(salida.body.incidencias).toEqual(['Botas de seguridad']);
      expect((await prisma.visita.findUniqueOrThrow({ where: { id: visitaId } })).estado).toBe('FINALIZADA');
      const autorizaciones = await prisma.autorizacionTerminal.findMany({ where: { visitaId } });
      expect(autorizaciones.every((a) => a.estado === 'REVOCADA')).toBe(true);
      expect((await pasar('Torniquete de entrada', visitaId)).status).toBe(409);
    });

    it('terminal fuera de línea: contingencia, cola y reintento de carga y revocación', async () => {
      await fueraDeLinea('Torniquete de entrada', false);
      let visitaId: string;
      try {
        const r = await enPlanta();
        visitaId = r.visitaId;
        expect(r.confirmado.resultado).toBe('CONTINGENCIA');
      } finally {
        await fueraDeLinea('Torniquete de entrada', true);
      }
      const servicio = app.get(TerminalesService);
      await servicio.reintentarPendientes();
      const entrada = await terminal('Torniquete de entrada');
      expect((await prisma.autorizacionTerminal.findUniqueOrThrow({ where: { visitaId_terminalId: { visitaId, terminalId: entrada.id } } })).estado).toBe('CARGADA');

      await fueraDeLinea('Torniquete de salida', false);
      try {
        const salida = await api(`/check-out/${visitaId}/confirmar`, { credencialDevuelta: true, eppDevuelto: OBLIGATORIOS }).expect(200);
        expect(salida.body.acs.contingencia).toBe(true);
      } finally {
        await fueraDeLinea('Torniquete de salida', true);
      }
      await servicio.reintentarPendientes();
      const autorizaciones = await prisma.autorizacionTerminal.findMany({ where: { visitaId } });
      expect(autorizaciones.every((a) => a.estado === 'REVOCADA')).toBe(true);
    });

    it('el lector de zona rechaza sin autorización y registra con ella', async () => {
      const oficinaSinLector = await enPlanta();
      expect((await pasar('Lector Hilatura', oficinaSinLector.visitaId)).status).toBe(403);

      const hilatura = await prisma.zona.findUniqueOrThrow({ where: { nombre: 'Hilatura' } });
      const acompanante = await prisma.usuarioInterno.findUniqueOrThrow({ where: { correo: 'luis.ejemplo@plantatextil.local' } });
      const { visitaId } = await enPlanta({ zonaId: hilatura.id, acompananteId: acompanante.id });
      const paso = await pasar('Lector Hilatura', visitaId);
      expect(paso.status).toBe(200);
      expect(paso.body).toEqual({ resultado: 'ZONA', zona: 'Hilatura' });
      expect(await prisma.movimientoZona.count({ where: { visitaId, zonaId: hilatura.id, horaSalida: null } })).toBe(1);
    });

    it('los eventos reales exigen el secreto del terminal', async () => {
      const { visitaId } = await enPlanta();
      const entrada = await terminal('Torniquete de entrada');
      await http().post(`/api/v1/terminales/${entrada.id}/eventos`).send({ visitaId }).expect(401);
      await http().post(`/api/v1/terminales/${entrada.id}/eventos`).set('x-terminal-secreto', 'incorrecto').send({ visitaId }).expect(401);
    });
  });

  describe('HU-38: gestión de terminales', () => {
    let admin: string[];
    let recepcion: string[];
    const aviso = (c: string) => prisma.notificacion.count({ where: { tipo: 'AVISO_TERMINAL_FUERA_LINEA', destinatario: c } });

    beforeAll(async () => {
      admin = await iniciarSesion('admin@plantatextil.local');
      recepcion = await iniciarSesion('recepcion@plantatextil.local');
    });

    it('registra con secreto de un solo uso, autentica eventos y nunca expone el hash', async () => {
      const nombre = `Terminal E2E ${randomUUID()}`;
      await http().post('/api/v1/terminales').set('Cookie', recepcion).send({ nombre, tipo: 'ENTRADA', ip: '10.0.0.99' }).expect(403);
      await http().post('/api/v1/terminales').set('Cookie', admin).send({ nombre, tipo: 'ZONA', ip: '10.0.0.99' }).expect(422);
      const { body } = await http().post('/api/v1/terminales').set('Cookie', admin).send({ nombre, tipo: 'ENTRADA', ip: '10.0.0.99' }).expect(201);
      expect(body.secreto).toEqual(expect.any(String));
      const lista = await http().get('/api/v1/terminales').set('Cookie', admin).expect(200);
      const fila = lista.body.terminales.find((t: { id: string }) => t.id === body.id);
      expect(fila.tieneSecreto).toBe(true);
      expect(JSON.stringify(lista.body)).not.toContain('secretoHash');
      expect(JSON.stringify(lista.body)).not.toContain(body.secreto);
      // Con el secreto correcto pasa la autenticación y responde por la visita, no por la credencial
      await http().post(`/api/v1/terminales/${body.id}/eventos`).set('x-terminal-secreto', body.secreto).send({ visitaId: randomUUID() }).expect(409);
      await http().patch(`/api/v1/terminales/${body.id}`).set('Cookie', admin).send({ activo: false }).expect(200);
      await http().post(`/api/v1/terminales/${body.id}/eventos`).set('x-terminal-secreto', body.secreto).send({ visitaId: randomUUID() }).expect(401);
    });

    it('avisa a Seguridad solo tras la tolerancia y una sola vez', async () => {
      const { body } = await http().post('/api/v1/terminales').set('Cookie', admin).send({ nombre: `Caida E2E ${randomUUID()}`, tipo: 'SALIDA', ip: '10.0.0.98' }).expect(201);
      const servicio = app.get(TerminalesService);
      const correo = 'carlos.ejemplo@plantatextil.local';
      const inicio = new Date();
      await servicio.sondearTerminales(inicio);
      expect((await prisma.terminalBiometrico.findUniqueOrThrow({ where: { id: body.id } })).enLinea).toBe(true);
      const previos = await aviso(correo);
      await http().patch(`/api/v1/terminales/${body.id}/simulado`).set('Cookie', admin).send({ enLinea: false }).expect(200);
      await servicio.sondearTerminales(new Date(inicio.getTime() + 60_000));
      expect((await prisma.terminalBiometrico.findUniqueOrThrow({ where: { id: body.id } })).enLinea).toBe(true);
      await servicio.sondearTerminales(new Date(inicio.getTime() + 180_000));
      await servicio.sondearTerminales(new Date(inicio.getTime() + 240_000));
      await new Promise((r) => setTimeout(r, 300));
      expect((await prisma.terminalBiometrico.findUniqueOrThrow({ where: { id: body.id } })).enLinea).toBe(false);
      expect(await aviso(correo)).toBe(previos + 1);
      await http().patch(`/api/v1/terminales/${body.id}/simulado`).set('Cookie', admin).send({ enLinea: true }).expect(200);
      await http().patch(`/api/v1/terminales/${body.id}`).set('Cookie', admin).send({ activo: false }).expect(200);
    });
  });

  describe('HU-36, HU-39: purga y revocación', () => {
    let recepcion: string[];
    let dpo: string[];
    const OBLIGATORIOS = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];
    const api = (ruta: string, cuerpo?: object, cookies = recepcion) => http().post(`/api/v1${ruta}`).set('Cookie', cookies).send(cuerpo);

    async function conHuella() {
      const datos = await visitaConHuellaAutorizada();
      await api(`/biometria/visitas/${datos.visitaId}/enrolamiento`, { identidadConfirmada: true, muestras: muestras(`persona-${randomUUID()}`) }).expect(201);
      return datos;
    }
    const documentoDe = async (visitanteId: string) => visitantes.descifrar(await prisma.visitante.findUniqueOrThrow({ where: { id: visitanteId } })).numeroDocumento;
    const atender = async (tipo: string, visitanteId: string) => {
      const { body } = await api('/privacidad/solicitudes', { tipo, numeroDocumento: await documentoDe(visitanteId) }, dpo).expect(201);
      return http().patch(`/api/v1/privacidad/solicitudes/${body.id}/atender`).set('Cookie', dpo).send({ respuesta: 'Atendida' });
    };

    beforeAll(async () => {
      recepcion = await iniciarSesion('recepcion@plantatextil.local');
      dpo = await iniciarSesion('dpo@plantatextil.local');
    });

    it('la purga diaria elimina solo lo vencido, respeta a quien está en planta y deja constancia', async () => {
      const vencida = await conHuella();
      const vigente = await conHuella();
      const enPlanta = await conHuella();
      await api(`/visitas/${enPlanta.visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      await api(`/check-in/${enPlanta.visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      const pasado = new Date(Date.now() - 86_400_000);
      await prisma.plantillaBiometrica.updateMany({ where: { visitanteId: { in: [vencida.visitanteId, enPlanta.visitanteId] } }, data: { venceEn: pasado } });

      await app.get(PrivacidadService).purgarPlantillasVencidas();
      expect(await prisma.plantillaBiometrica.count({ where: { visitanteId: vencida.visitanteId } })).toBe(0);
      expect(await prisma.plantillaBiometrica.count({ where: { visitanteId: vigente.visitanteId } })).toBe(2);
      expect(await prisma.plantillaBiometrica.count({ where: { visitanteId: enPlanta.visitanteId } })).toBe(2);
      await esperar();
      expect(await prisma.eventoBitacora.count({ where: { tipoEvento: 'PLANTILLA_PURGADA', entidadId: vencida.visitanteId } })).toBe(1);
    });

    it('el ingreso con huella renueva la vigencia', async () => {
      const datos = await conHuella();
      await prisma.plantillaBiometrica.updateMany({ where: { visitanteId: datos.visitanteId }, data: { venceEn: new Date(Date.now() + 86_400_000) } });
      await api(`/visitas/${datos.visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      await api(`/check-in/${datos.visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      const plantilla = await prisma.plantillaBiometrica.findFirstOrThrow({ where: { visitanteId: datos.visitanteId } });
      expect(plantilla.venceEn.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);
    });

    it('la revocación borra la huella, conserva los datos y pasa las visitas abiertas a la alternativa', async () => {
      const { visitaId, visitanteId } = await conHuella();
      const r = await atender('REVOCACION_BIOMETRICA', visitanteId);
      expect(r.status).toBe(200);
      expect(r.body.respuesta).toContain('2 plantilla(s)');
      expect(await prisma.plantillaBiometrica.count({ where: { visitanteId } })).toBe(0);
      expect((await prisma.visitante.findUniqueOrThrow({ where: { id: visitanteId } })).anonimizado).toBe(false);
      expect((await prisma.consentimiento.findUniqueOrThrow({ where: { visitaId } })).autorizaBiometria).toBe(false);
      await api(`/check-in/${visitaId}/credencial-alternativa`, { motivo: 'VISITANTE_NO_DESEA' }).expect(200);
    });

    it('no revoca a quien está en planta, y la anonimización también elimina las plantillas', async () => {
      const dentro = await conHuella();
      await api(`/visitas/${dentro.visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      await api(`/check-in/${dentro.visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      expect((await atender('REVOCACION_BIOMETRICA', dentro.visitanteId)).status).toBe(409);
      await api(`/check-out/${dentro.visitaId}/confirmar`, { credencialDevuelta: true, eppDevuelto: OBLIGATORIOS }).expect(200);

      const r = await atender('ANONIMIZACION', dentro.visitanteId);
      expect(r.status).toBe(200);
      expect(r.body.respuesta).toContain('2 plantilla(s)');
      expect(await prisma.plantillaBiometrica.count({ where: { visitanteId: dentro.visitanteId } })).toBe(0);
    });
  });

  describe('HU-21, HU-23, RNF-07: indicadores y ausencia de plantillas', () => {
    it('calcula la tasa de rechazo y los tiempos por caso', async () => {
      const recepcion = await iniciarSesion('recepcion@plantatextil.local');
      const persona = `persona-${randomUUID()}`;
      const api = (ruta: string, cuerpo?: object) => http().post(`/api/v1${ruta}`).set('Cookie', recepcion).send(cuerpo);
      const { visitaId, visitanteId } = await visitaConHuellaAutorizada();
      await api(`/biometria/visitas/${visitaId}/enrolamiento`, { identidadConfirmada: true, muestras: muestras(persona) }).expect(201);
      await api(`/visitas/${visitaId}/epp`, { elementos: ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'].map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      await api(`/check-in/${visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      await api('/biometria/identificacion', { formato: 'SIMULADO', plantilla: `otra-${randomUUID()}`, calidad: 80, pruebaVida: true }).expect(200);
      await esperar();

      const fecha = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
      const valores = await app.get(KpiService).calcularDia(fecha);
      expect(valores.get('TASA_RECHAZO_BIOMETRICO')).toBeGreaterThan(0);
      expect(valores.get('TIEMPO_CHECKIN_P90_PRIMERA_VISITA')).toEqual(expect.any(Number));

      // Ninguna vista de datos expone la plantilla de esta persona, para ningún rol
      const consultas: [string, string][] = [
        ['admin@plantatextil.local', `/visitas/${visitaId}`],
        ['admin@plantatextil.local', '/terminales'],
        ['admin@plantatextil.local', `/bitacora?visitaId=${visitaId}`],
        ['admin@plantatextil.local', '/privacidad/exportar'],
        ['dpo@plantatextil.local', `/bitacora?visitaId=${visitaId}`],
        ['carlos.ejemplo@plantatextil.local', '/permanencia/presentes'],
        ['recepcion@plantatextil.local', `/biometria/visitas/${visitaId}`],
        ['recepcion@plantatextil.local', `/visitas/${visitaId}/requisitos`],
      ];
      for (const [correo, ruta] of consultas) {
        const cookies = await iniciarSesion(correo);
        const r = await http().get(`/api/v1${ruta}`).set('Cookie', cookies);
        expect(r.status, ruta).toBeLessThan(400);
        const contenido = `${r.text}`;
        expect(contenido, ruta).not.toContain(persona);
        expect(contenido, ruta).not.toContain('datoCifrado');
        expect(contenido, ruta).not.toContain('secretoHash');
      }
      for (const correo of ['admin@plantatextil.local', 'dpo@plantatextil.local', 'carlos.ejemplo@plantatextil.local', 'ana.ejemplo@plantatextil.local']) {
        const cookies = await iniciarSesion(correo);
        await http().get(`/api/v1/biometria/visitas/${visitaId}`).set('Cookie', cookies).expect(403);
      }
      expect(visitanteId).toEqual(expect.any(String));
    });
  });

  describe('Ajustes: HU-15, HU-29 y salidas recientes', () => {
    const OBLIGATORIOS = ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'];

    it('registra el método en la salida y lo muestra en el histórico y en las salidas recientes', async () => {
      const recepcion = await iniciarSesion('recepcion@plantatextil.local');
      const admin = await iniciarSesion('admin@plantatextil.local');
      const api = (ruta: string, cuerpo?: object) => http().post(`/api/v1${ruta}`).set('Cookie', recepcion).send(cuerpo);
      const { visitaId } = await visitaConHuellaAutorizada();
      await api(`/biometria/visitas/${visitaId}/enrolamiento`, { identidadConfirmada: true, muestras: muestras(`persona-${randomUUID()}`) }).expect(201);
      await api(`/visitas/${visitaId}/epp`, { elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      await api(`/check-in/${visitaId}/confirmar`, { identidadVerificada: true }).expect(200);
      const salida = await prisma.terminalBiometrico.findUniqueOrThrow({ where: { nombre: 'Torniquete de salida' } });
      await api(`/terminales/${salida.id}/simular-paso`, { visitaId }).expect(200);
      await esperar();

      const evento = await prisma.eventoBitacora.findFirstOrThrow({ where: { visitaId, tipoEvento: 'CHECKOUT_REALIZADO' } });
      expect(evento.detalle).toMatchObject({ metodoIdentificacion: 'HUELLA', origen: 'TERMINAL' });
      const detalle = await http().get(`/api/v1/visitas/${visitaId}`).set('Cookie', admin).expect(200);
      expect(detalle.body.metodoIdentificacion).toBe('HUELLA');
      const recientes = await http().get('/api/v1/check-out/salidas-recientes').set('Cookie', recepcion).expect(200);
      expect(recientes.body.find((s: { visitaId: string }) => s.visitaId === visitaId)).toMatchObject({ terminal: 'Torniquete de salida', revocacionesPendientes: 0 });
    });

    it('HU-29: cada integrante de un grupo decide por separado y entra por su cuenta', async () => {
      const recepcion = await iniciarSesion('recepcion@plantatextil.local');
      const anfitriona = await iniciarSesion('ana.ejemplo@plantatextil.local');
      const motivo = `Grupo mixto ${randomUUID()}`;
      const marca = documentoNuevo();
      await http().post('/api/v1/invitaciones').set('Cookie', anfitriona).send({
        fechaVisita: new Date().toISOString(),
        motivo,
        tiempoAutorizadoMin: 60,
        visitantes: [
          { nombreCompleto: 'Integrante Huella', correo: `h${marca}@ejemplo.test`, empresa: 'Grupo' },
          { nombreCompleto: 'Integrante Credencial', correo: `c${marca}@ejemplo.test`, empresa: 'Grupo' },
        ],
      }).expect(201);
      const visitas = await prisma.visita.findMany({ where: { motivo }, orderBy: { createdAt: 'asc' } });
      expect(visitas).toHaveLength(2);
      const preparar = async (visitaId: string, correo: string, documento: string, autorizaBiometria: boolean) => {
        const token = randomUUID();
        await prisma.visita.update({ where: { id: visitaId }, data: { tokenEnlaceHash: crypto.hashToken(token) } });
        await http().put(`/api/v1/pre-registro/${token}/datos`).send({ nombreCompleto: 'Integrante Grupo', tipoDocumento: 'CC', numeroDocumento: documento, empresa: 'Grupo', correo }).expect(200);
        await http().post(`/api/v1/pre-registro/${token}/consentimiento`).send({ aceptaTratamiento: true, aceptaNda: true, autorizaBiometria }).expect(200);
        await aprobarInduccion(token);
        return (await http().post(`/api/v1/pre-registro/${token}/finalizar`).expect(200)).body;
      };
      const correos = await Promise.all(visitas.map((v) => prisma.visita.findUniqueOrThrow({ where: { id: v.id }, include: { visitante: true } }).then((x) => visitantes.descifrar(x.visitante).correo)));
      const conHuella = await preparar(visitas[0].id, correos[0], documentoNuevo(), true);
      const conQr = await preparar(visitas[1].id, correos[1], documentoNuevo(), false);
      expect(conHuella.estado.paso).toBe('HUELLA');
      expect(conQr.estado.paso).toBe('CREDENCIAL');

      await http().post(`/api/v1/visitas/${visitas[1].id}/epp`).set('Cookie', recepcion).send({ elementos: OBLIGATORIOS.map((elemento) => ({ elemento, entregado: true })) }).expect(201);
      await http().post(`/api/v1/check-in/${visitas[1].id}/confirmar`).set('Cookie', recepcion).send({ identidadVerificada: true }).expect(200);
      const estados = await prisma.visita.findMany({ where: { motivo }, orderBy: { createdAt: 'asc' }, select: { estado: true, metodoIdentificacion: true } });
      expect(estados).toEqual([{ estado: 'PRE_REGISTRADA', metodoIdentificacion: null }, { estado: 'EN_PLANTA', metodoIdentificacion: 'CREDENCIAL_ALTERNATIVA' }]);
      await http().post(`/api/v1/check-out/${visitas[1].id}/confirmar`).set('Cookie', recepcion).send({ credencialDevuelta: true, eppDevuelto: OBLIGATORIOS }).expect(200);
    });
  });
});
