import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Claves de la tabla `configuracion` (ver prisma/seed.ts). */
export type ClaveConfiguracion =
  | 'enlace_preregistro_horas'
  | 'qr_margen_antes_min'
  | 'qr_margen_despues_min'
  | 'permanencia_default_min'
  | 'acs_timeout_ms'
  | 'induccion_puntaje_minimo'
  | 'induccion_vigencia_meses'
  | 'retencion_dias'
  | 'politica_version'
  | 'login_max_intentos'
  | 'login_bloqueo_min'
  | 'sesion_inactividad_min'
  | 'epp_obligatorio'
  | 'reportes_periodicidad'
  | 'reportes_destinatarios'
  | 'biometria_calidad_minima'
  | 'biometria_intentos'
  | 'biometria_muestras_por_dedo'
  | 'biometria_retencion_meses'
  | 'terminal_fuera_linea_min';

const CACHE_MS = 60_000;

/**
 * Parámetros editables desde el panel de administración. Si una clave no
 * existe en la tabla, se usa el valor de las variables de entorno.
 */
@Injectable()
export class ConfiguracionService {
  private cache: { valores: Map<string, unknown>; expira: number } | null = null;
  private readonly porDefecto: Record<ClaveConfiguracion, unknown>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.porDefecto = {
      enlace_preregistro_horas: config.get('ENLACE_PREREGISTRO_HORAS', { infer: true }),
      qr_margen_antes_min: config.get('QR_MARGEN_ANTES_MIN', { infer: true }),
      qr_margen_despues_min: config.get('QR_MARGEN_DESPUES_MIN', { infer: true }),
      permanencia_default_min: config.get('PERMANENCIA_DEFAULT_MIN', { infer: true }),
      acs_timeout_ms: config.get('ACS_TIMEOUT_MS', { infer: true }),
      induccion_puntaje_minimo: config.get('INDUCCION_PUNTAJE_MINIMO', { infer: true }),
      induccion_vigencia_meses: config.get('INDUCCION_VIGENCIA_MESES', { infer: true }),
      retencion_dias: config.get('RETENCION_DIAS', { infer: true }),
      politica_version: '2026-01',
      login_max_intentos: config.get('LOGIN_MAX_INTENTOS', { infer: true }),
      login_bloqueo_min: config.get('LOGIN_BLOQUEO_MIN', { infer: true }),
      sesion_inactividad_min: 15,
      epp_obligatorio: ['CASCO', 'GAFAS', 'PROTECTOR_AUDITIVO', 'BOTAS'],
      reportes_periodicidad: '',
      reportes_destinatarios: [],
      biometria_calidad_minima: 40,
      biometria_intentos: 3,
      biometria_muestras_por_dedo: 3,
      biometria_retencion_meses: 12,
      terminal_fuera_linea_min: 2,
    };
  }

  async numero(clave: ClaveConfiguracion): Promise<number> {
    const v = await this.valor(clave);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : Number(this.porDefecto[clave]);
  }

  async texto(clave: ClaveConfiguracion): Promise<string> {
    const v = await this.valor(clave);
    return typeof v === 'string' ? v : String(v ?? this.porDefecto[clave]);
  }

  async lista(clave: ClaveConfiguracion): Promise<string[]> {
    const v = await this.valor(clave);
    return Array.isArray(v) ? v.map(String) : (this.porDefecto[clave] as string[]);
  }

  async todas(): Promise<{ clave: string; valor: unknown; descripcion: string | null; updatedAt: Date }[]> {
    return this.prisma.configuracion.findMany({ orderBy: { clave: 'asc' } });
  }

  async actualizar(clave: ClaveConfiguracion, valor: unknown): Promise<void> {
    await this.prisma.configuracion.upsert({
      where: { clave },
      update: { valor: valor as Prisma.InputJsonValue },
      create: { clave, valor: valor as Prisma.InputJsonValue },
    });
    this.cache = null;
  }

  private async valor(clave: ClaveConfiguracion): Promise<unknown> {
    const ahora = Date.now();
    if (!this.cache || this.cache.expira < ahora) {
      const filas = await this.prisma.configuracion.findMany();
      this.cache = { valores: new Map(filas.map((f) => [f.clave, f.valor])), expira: ahora + CACHE_MS };
    }
    return this.cache.valores.has(clave) ? this.cache.valores.get(clave) : this.porDefecto[clave];
  }
}
