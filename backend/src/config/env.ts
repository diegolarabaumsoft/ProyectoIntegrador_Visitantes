import { z } from 'zod';

/**
 * Esquema de variables de entorno. Se valida al arrancar la aplicación:
 * si falta una variable obligatoria o tiene un formato inválido, el proceso
 * no inicia y el mensaje indica exactamente qué corregir.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('8h'),
  JWT_QR_SECRET: z.string().min(32, 'JWT_QR_SECRET debe tener al menos 32 caracteres'),
  CRYPTO_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'CRYPTO_KEY debe ser 32 bytes en base64'),
  CRYPTO_PEPPER: z.string().min(16, 'CRYPTO_PEPPER debe tener al menos 16 caracteres'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('VMS <vms@localhost>'),

  ACS_MODE: z.enum(['simulado', 'http']).default('simulado'),
  ACS_URL: z.string().default('http://localhost:4000/acs'),
  ACS_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  ACS_SIMULADO_COMPORTAMIENTO: z.enum(['ok', 'timeout', 'error']).default('ok'),

  ENLACE_PREREGISTRO_HORAS: z.coerce.number().int().positive().default(72),
  QR_MARGEN_ANTES_MIN: z.coerce.number().int().nonnegative().default(60),
  QR_MARGEN_DESPUES_MIN: z.coerce.number().int().nonnegative().default(120),
  PERMANENCIA_DEFAULT_MIN: z.coerce.number().int().positive().default(240),
  INDUCCION_PUNTAJE_MINIMO: z.coerce.number().int().min(0).max(100).default(80),
  INDUCCION_VIGENCIA_MESES: z.coerce.number().int().positive().default(12),
  RETENCION_DIAS: z.coerce.number().int().positive().default(365),
  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(5),
  LOGIN_BLOQUEO_MIN: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

export function validarEnv(config: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(config);
  if (!resultado.success) {
    const detalles = resultado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detalles}`);
  }
  return resultado.data;
}
