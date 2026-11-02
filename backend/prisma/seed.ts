/**
 * Datos iniciales para desarrollo y piloto.
 *
 * Ejecutar con: npm run prisma:seed   (o `npx prisma db seed`)
 *
 * Crea un usuario por cada rol, el catálogo de zonas de la planta, las
 * preguntas de la inducción de seguridad y la configuración por defecto.
 * Es idempotente: puede ejecutarse varias veces sin duplicar registros.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { Rol, TipoTerminal } from '../src/generated/prisma/enums.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

/** Contraseña de todos los usuarios de ejemplo (solo desarrollo). */
const CONTRASENA_DESARROLLO = 'Vms.2026*';

const usuarios = [
  { nombre: 'Admin VMS', correo: 'admin@plantatextil.local', rol: Rol.ADMINISTRADOR },
  { nombre: 'Ana Ejemplo', correo: 'ana.ejemplo@plantatextil.local', rol: Rol.ANFITRION, area: 'Compras' },
  { nombre: 'Luis Ejemplo', correo: 'luis.ejemplo@plantatextil.local', rol: Rol.ANFITRION, area: 'Mantenimiento' },
  { nombre: 'Rosa Recepción', correo: 'recepcion@plantatextil.local', rol: Rol.RECEPCION_SEGURIDAD },
  { nombre: 'Carlos Ejemplo', correo: 'carlos.ejemplo@plantatextil.local', rol: Rol.JEFE_SEGURIDAD },
  { nombre: 'Diana Datos', correo: 'dpo@plantatextil.local', rol: Rol.DPO },
] as const;

const zonas = [
  { nombre: 'Oficinas', esSensible: false, requiereAcompanante: false },
  { nombre: 'Recepción', esSensible: false, requiereAcompanante: false },
  { nombre: 'Hilatura', esSensible: true, requiereAcompanante: true },
  { nombre: 'Telares', esSensible: true, requiereAcompanante: true },
  { nombre: 'Tintorería', esSensible: true, requiereAcompanante: true },
  { nombre: 'Bodega de materia prima', esSensible: true, requiereAcompanante: false },
  { nombre: 'Control de calidad', esSensible: false, requiereAcompanante: false },
  { nombre: 'Parqueadero', esSensible: false, requiereAcompanante: false },
];

const terminales = [
  { nombre: 'Torniquete de entrada', tipo: TipoTerminal.ENTRADA, ip: '10.0.0.11' },
  { nombre: 'Torniquete de salida', tipo: TipoTerminal.SALIDA, ip: '10.0.0.12' },
  { nombre: 'Lector Hilatura', tipo: TipoTerminal.ZONA, ip: '10.0.0.21', zona: 'Hilatura' },
  { nombre: 'Lector Telares', tipo: TipoTerminal.ZONA, ip: '10.0.0.22', zona: 'Telares' },
  { nombre: 'Lector Tintorería', tipo: TipoTerminal.ZONA, ip: '10.0.0.23', zona: 'Tintorería' },
  { nombre: 'Lector Bodega', tipo: TipoTerminal.ZONA, ip: '10.0.0.24', zona: 'Bodega de materia prima' },
];

const preguntas = [
  {
    orden: 1,
    enunciado: '¿Qué elementos de protección personal son obligatorios para ingresar a las áreas de producción?',
    opciones: [
      'Solo casco',
      'Casco, gafas de seguridad, protección auditiva y botas',
      'Ninguno si la visita es corta',
      'Solo chaleco reflectivo',
    ],
    respuestaCorrecta: 1,
  },
  {
    orden: 2,
    enunciado: 'Si escucha la alarma de evacuación, usted debe:',
    opciones: [
      'Esperar instrucciones en su puesto',
      'Dirigirse al punto de encuentro con su acompañante por la ruta señalizada',
      'Buscar sus pertenencias primero',
      'Usar el ascensor para salir rápido',
    ],
    respuestaCorrecta: 1,
  },
  {
    orden: 3,
    enunciado: 'En las zonas de hilatura y telares está prohibido:',
    opciones: [
      'Usar protección auditiva',
      'Caminar por las zonas demarcadas',
      'Acercarse a la maquinaria en movimiento y usar ropa suelta o accesorios colgantes',
      'Acompañar al anfitrión',
    ],
    respuestaCorrecta: 2,
  },
  {
    orden: 4,
    enunciado: 'Las fibras textiles y los químicos de tintorería representan riesgo de:',
    opciones: [
      'Incendio e inhalación; por eso está prohibido fumar y se exige tapabocas donde esté señalizado',
      'Ningún riesgo',
      'Solo riesgo eléctrico',
      'Solo riesgo de caídas',
    ],
    respuestaCorrecta: 0,
  },
  {
    orden: 5,
    enunciado: '¿Qué debe hacer al finalizar su visita?',
    opciones: [
      'Salir directamente por el torniquete',
      'Registrar el check-out en recepción y devolver la credencial y el EPP',
      'Dejar el EPP en cualquier lugar',
      'Avisar solo al anfitrión',
    ],
    respuestaCorrecta: 1,
  },
];

const configuracion = [
  { clave: 'enlace_preregistro_horas', valor: 72, descripcion: 'Vigencia del enlace de pre-registro en horas' },
  { clave: 'qr_margen_antes_min', valor: 60, descripcion: 'Minutos antes de la fecha programada desde los que es válido el QR' },
  { clave: 'qr_margen_despues_min', valor: 120, descripcion: 'Minutos después de la hora programada + permanencia durante los que es válido el QR' },
  { clave: 'permanencia_default_min', valor: 240, descripcion: 'Tiempo de permanencia autorizado por defecto (minutos)' },
  { clave: 'acs_timeout_ms', valor: 3000, descripcion: 'Tiempo máximo de espera de respuesta del control de acceso físico' },
  { clave: 'induccion_puntaje_minimo', valor: 80, descripcion: 'Puntaje mínimo de aprobación de la inducción (%)' },
  { clave: 'induccion_vigencia_meses', valor: 12, descripcion: 'Vigencia de la inducción aprobada (meses)' },
  { clave: 'retencion_dias', valor: 365, descripcion: 'Días de retención de datos personales antes de anonimizar' },
  { clave: 'politica_version', valor: '2026-01', descripcion: 'Versión vigente de la política de tratamiento de datos' },
  { clave: 'login_max_intentos', valor: 5, descripcion: 'Intentos fallidos antes de bloquear la cuenta' },
  { clave: 'login_bloqueo_min', valor: 30, descripcion: 'Minutos de bloqueo de la cuenta' },
  { clave: 'sesion_inactividad_min', valor: 15, descripcion: 'Minutos de inactividad antes de cerrar la sesión' },
  { clave: 'biometria_calidad_minima', valor: 40, descripcion: 'Calidad mínima aceptada en cada muestra de huella (0-100)' },
  { clave: 'biometria_intentos', valor: 3, descripcion: 'Intentos de identificación antes de ofrecer la credencial alternativa' },
  { clave: 'biometria_muestras_por_dedo', valor: 3, descripcion: 'Muestras capturadas por cada dedo durante el enrolamiento' },
  { clave: 'biometria_retencion_meses', valor: 12, descripcion: 'Meses sin visitas tras los que se purgan las plantillas biométricas' },
  { clave: 'terminal_fuera_linea_min', valor: 2, descripcion: 'Minutos sin respuesta para considerar un terminal fuera de línea' },
  { clave: 'epp_obligatorio', valor: ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'], descripcion: 'EPP exigido para autorizar el ingreso a planta' },
];

async function main(): Promise<void> {
  const hash = await bcrypt.hash(CONTRASENA_DESARROLLO, 12);

  for (const u of usuarios) {
    await prisma.usuarioInterno.upsert({
      where: { correo: u.correo },
      update: { nombre: u.nombre, rol: u.rol, area: 'area' in u ? u.area : null, activo: true },
      create: { nombre: u.nombre, correo: u.correo, rol: u.rol, area: 'area' in u ? u.area : null, hashContrasena: hash },
    });
  }
  console.log(`✔ ${usuarios.length} usuarios internos`);

  for (const z of zonas) {
    await prisma.zona.upsert({ where: { nombre: z.nombre }, update: z, create: z });
  }
  console.log(`✔ ${zonas.length} zonas`);

  for (const { zona, ...t } of terminales) {
    const zonaId = zona ? (await prisma.zona.findUnique({ where: { nombre: zona } }))?.id ?? null : null;
    await prisma.terminalBiometrico.upsert({ where: { nombre: t.nombre }, update: {}, create: { ...t, zonaId } });
  }
  console.log(`✔ ${terminales.length} terminales biométricos`);

  if ((await prisma.preguntaInduccion.count()) === 0) {
    await prisma.preguntaInduccion.createMany({ data: preguntas });
  }
  console.log(`✔ ${preguntas.length} preguntas de inducción`);

  for (const c of configuracion) {
    await prisma.configuracion.upsert({
      where: { clave: c.clave },
      update: { descripcion: c.descripcion },
      create: c,
    });
  }
  console.log(`✔ ${configuracion.length} parámetros de configuración`);
}

main()
  .catch((error: unknown) => {
    console.error('Error en el seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
