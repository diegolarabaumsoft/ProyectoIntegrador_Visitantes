import { BadRequestException, Injectable } from '@nestjs/common';
import { sumarMeses } from '../../common/utils/duracion.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { InduccionSeguridad } from '../../generated/prisma/client.js';
import { TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

export interface PreguntaPublica {
  id: string;
  orden: number;
  enunciado: string;
  opciones: string[];
}

export interface RespuestaInduccion {
  preguntaId: string;
  opcion: number;
}

export interface ResultadoInduccion {
  aprobada: boolean;
  puntaje: number;
  puntajeMinimo: number;
  correctas: number;
  total: number;
  venceEn: Date | null;
}

/**
 * Inducción de seguridad en línea (HU-32): evaluación con puntaje mínimo
 * configurable (80 %) y vigencia de 12 meses. Pertenece al visitante, no a la visita.
 */
@Injectable()
export class InduccionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
  ) {}

  async vigente(visitanteId: string): Promise<InduccionSeguridad | null> {
    return this.prisma.induccionSeguridad.findFirst({
      where: { visitanteId, aprobada: true, venceEn: { gt: new Date() } },
      orderBy: { fechaAprobacion: 'desc' },
    });
  }

  async preguntas(): Promise<PreguntaPublica[]> {
    const filas = await this.prisma.preguntaInduccion.findMany({ where: { activa: true }, orderBy: { orden: 'asc' } });
    return filas.map((p) => ({ id: p.id, orden: p.orden, enunciado: p.enunciado, opciones: (p.opciones as string[]) ?? [] }));
  }

  async evaluar(visitanteId: string, visitaId: string, respuestas: RespuestaInduccion[], ip?: string): Promise<ResultadoInduccion> {
    const preguntas = await this.prisma.preguntaInduccion.findMany({ where: { activa: true } });
    if (preguntas.length === 0) {
      throw new BadRequestException({ codigo: 'SIN_PREGUNTAS', mensaje: 'La inducción no tiene preguntas configuradas' });
    }
    const porId = new Map(respuestas.map((r) => [r.preguntaId, r.opcion]));
    const faltantes = preguntas.filter((p) => !porId.has(p.id));
    if (faltantes.length > 0) {
      throw new BadRequestException({
        codigo: 'RESPUESTAS_INCOMPLETAS',
        mensaje: `Debe responder todas las preguntas (faltan ${faltantes.length})`,
      });
    }
    const correctas = preguntas.filter((p) => porId.get(p.id) === p.respuestaCorrecta).length;
    const puntaje = Math.round((correctas / preguntas.length) * 100);
    const [puntajeMinimo, vigenciaMeses] = await Promise.all([
      this.configuracion.numero('induccion_puntaje_minimo'),
      this.configuracion.numero('induccion_vigencia_meses'),
    ]);
    const aprobada = puntaje >= puntajeMinimo;
    const ahora = new Date();
    const venceEn = aprobada ? sumarMeses(ahora, vigenciaMeses) : null;

    await this.prisma.induccionSeguridad.create({
      data: {
        visitanteId,
        puntaje,
        aprobada,
        fechaAprobacion: aprobada ? ahora : null,
        venceEn,
        respuestas: respuestas.map((r) => ({ preguntaId: r.preguntaId, opcion: r.opcion })),
      },
    });

    this.eventos.publicar(Eventos.INDUCCION_EVALUADA, {
      tipo: aprobada ? TipoEvento.INDUCCION_APROBADA : TipoEvento.INDUCCION_REPROBADA,
      actor: 'Visitante',
      visitaId,
      entidad: 'visitante',
      entidadId: visitanteId,
      resultado: `${puntaje} % (mínimo ${puntajeMinimo} %)`,
      detalle: { correctas, total: preguntas.length, venceEn: venceEn?.toISOString() ?? null },
      ip,
    });

    return { aprobada, puntaje, puntajeMinimo, correctas, total: preguntas.length, venceEn };
  }
}
