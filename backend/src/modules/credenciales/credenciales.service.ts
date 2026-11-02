import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { CredencialQr, Visita } from '../../generated/prisma/client.js';
import { EstadoVisita, TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

interface PayloadQr {
  /** id de la visita */
  sub: string;
  /** id de la credencial (código) */
  jti: string;
  nbf: number;
  exp: number;
}

export type MotivoRechazo = 'FIRMA_INVALIDA' | 'VENCIDA' | 'AUN_NO_VIGENTE' | 'INVALIDADA' | 'NO_EXISTE' | 'VISITA_NO_ACTIVA';

export type ResultadoValidacion =
  | { valida: true; credencial: CredencialQr; visitaId: string }
  | { valida: false; motivo: MotivoRechazo; mensaje: string; visitaId?: string };

/**
 * Credenciales temporales (HU-05, HU-07). El QR contiene un JWT firmado con
 * un secreto propio: vigencia definida (nbf/exp), asociado de forma única a
 * la visita (sub) y a la credencial (jti). Responsabilidad única: solo genera
 * y valida; no envía correos ni escribe en la bitácora directamente.
 */
@Injectable()
export class CredencialesService {
  private readonly jwtQr: JwtService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
    config: ConfigService<Env, true>,
  ) {
    this.jwtQr = new JwtService({ secret: config.get('JWT_QR_SECRET', { infer: true }) });
  }

  /** Emite una credencial nueva para la visita (invalida la anterior si existía). */
  async generar(visita: Visita, actor = ACTOR_SISTEMA, actorId?: string): Promise<{ credencial: CredencialQr; codigoQr: string }> {
    const [antesMin, despuesMin] = await Promise.all([
      this.configuracion.numero('qr_margen_antes_min'),
      this.configuracion.numero('qr_margen_despues_min'),
    ]);
    const inicio = new Date(visita.fechaProgramada.getTime() - antesMin * 60_000);
    const venceEn = new Date(visita.fechaProgramada.getTime() + (visita.tiempoAutorizadoMin + despuesMin) * 60_000);

    await this.prisma.credencialQr.deleteMany({ where: { visitaId: visita.id, activa: false } });
    await this.prisma.credencialQr.updateMany({
      where: { visitaId: visita.id, activa: true },
      data: { activa: false, invalidadaEn: new Date(), motivoInvalidacion: 'Reemplazada por una credencial nueva' },
    });
    // La relación visita-credencial es 1:1: se elimina la anterior ya invalidada
    await this.prisma.credencialQr.deleteMany({ where: { visitaId: visita.id } });

    const credencial = await this.prisma.credencialQr.create({
      data: { visitaId: visita.id, codigo: randomUUID(), venceEn, activa: true },
    });
    const codigoQr = this.firmar(credencial, inicio);
    // El evento CREDENCIAL_EMITIDA lo publica el módulo que conoce al visitante
    // (pre-registro), porque el correo con el QR necesita sus datos de contacto.
    void actor;
    void actorId;
    return { credencial, codigoQr };
  }

  /** Vuelve a firmar el token de una credencial existente (mismos claims). */
  firmar(credencial: CredencialQr, inicio: Date): string {
    const payload: PayloadQr = {
      sub: credencial.visitaId,
      jti: credencial.codigo,
      nbf: Math.floor(inicio.getTime() / 1000),
      exp: Math.floor(credencial.venceEn.getTime() / 1000),
    };
    return this.jwtQr.sign(payload);
  }

  async obtenerActiva(visitaId: string): Promise<CredencialQr | null> {
    return this.prisma.credencialQr.findFirst({ where: { visitaId, activa: true } });
  }

  /** Reconstruye el token de la credencial activa de una visita (portal V6). */
  async tokenDeVisita(visita: Visita): Promise<string | null> {
    const credencial = await this.obtenerActiva(visita.id);
    if (!credencial) return null;
    const antesMin = await this.configuracion.numero('qr_margen_antes_min');
    return this.firmar(credencial, new Date(visita.fechaProgramada.getTime() - antesMin * 60_000));
  }

  /** Valida firma, vigencia y estado (HU-07). Nunca lanza: devuelve el motivo del rechazo. */
  async validar(codigoQr: string, actor = ACTOR_SISTEMA, actorId?: string): Promise<ResultadoValidacion> {
    let payload: PayloadQr;
    try {
      payload = this.jwtQr.verify<PayloadQr>(codigoQr);
    } catch (error) {
      const nombre = (error as { name?: string }).name;
      const motivo: MotivoRechazo = nombre === 'TokenExpiredError' ? 'VENCIDA' : nombre === 'NotBeforeError' ? 'AUN_NO_VIGENTE' : 'FIRMA_INVALIDA';
      return this.rechazo(motivo, undefined, actor, actorId);
    }
    const credencial = await this.prisma.credencialQr.findUnique({ where: { codigo: payload.jti }, include: { visita: true } });
    if (!credencial || credencial.visitaId !== payload.sub) return this.rechazo('NO_EXISTE', payload.sub, actor, actorId);
    if (!credencial.activa) return this.rechazo('INVALIDADA', credencial.visitaId, actor, actorId);
    if (credencial.venceEn < new Date()) return this.rechazo('VENCIDA', credencial.visitaId, actor, actorId);
    const estado = credencial.visita.estado;
    if (estado === EstadoVisita.CANCELADA || estado === EstadoVisita.FINALIZADA) {
      return this.rechazo('VISITA_NO_ACTIVA', credencial.visitaId, actor, actorId);
    }
    return { valida: true, credencial, visitaId: credencial.visitaId };
  }

  async invalidar(visitaId: string, motivo: string, actor = ACTOR_SISTEMA, actorId?: string): Promise<void> {
    const { count } = await this.prisma.credencialQr.updateMany({
      where: { visitaId, activa: true },
      data: { activa: false, invalidadaEn: new Date(), motivoInvalidacion: motivo },
    });
    if (count > 0) {
      this.eventos.publicar(Eventos.CREDENCIAL_INVALIDADA, {
        tipo: TipoEvento.CREDENCIAL_INVALIDADA,
        actor,
        actorId: actorId ?? null,
        visitaId,
        entidad: 'credencial',
        resultado: motivo,
      });
    }
  }

  private rechazo(motivo: MotivoRechazo, visitaId: string | undefined, actor: string, actorId?: string): ResultadoValidacion {
    const mensajes: Record<MotivoRechazo, string> = {
      FIRMA_INVALIDA: 'El código QR no es una credencial válida de esta planta',
      VENCIDA: 'La credencial está vencida',
      AUN_NO_VIGENTE: 'La credencial todavía no está vigente para la fecha de la visita',
      INVALIDADA: 'La credencial fue invalidada (visita reprogramada, cancelada o credencial reemplazada)',
      NO_EXISTE: 'La credencial no existe en el sistema',
      VISITA_NO_ACTIVA: 'La visita asociada ya finalizó o fue cancelada',
    };
    this.eventos.publicar(Eventos.CREDENCIAL_RECHAZADA, {
      tipo: TipoEvento.CREDENCIAL_RECHAZADA,
      actor,
      actorId: actorId ?? null,
      visitaId: visitaId ?? null,
      entidad: 'credencial',
      resultado: motivo,
    });
    return { valida: false, motivo, mensaje: mensajes[motivo], visitaId };
  }
}
