import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';
import { ACTOR_SISTEMA, Eventos } from '../../eventos/eventos.js';
import type { EventoAlertaPermanencia } from '../../eventos/payloads.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { EstadoVisita, TipoEvento } from '../../generated/prisma/enums.js';
import { VisitantesService } from '../visitantes/visitantes.service.js';

export interface ResultadoRevision {
  revisadas: number;
  alertadas: string[];
}

/**
 * Monitoreo de permanencia (HU-16, CU-03): cada dos minutos revisa las visitas
 * EN_PLANTA; si `horaIngreso + tiempoAutorizadoMin` ya pasó y aún no se ha
 * alertado, marca `alertaPermanenciaEn`, registra el evento y dispara el aviso
 * a seguridad (suscriptor en NotificacionesService). Es independiente del
 * check-out: la alerta se emite una sola vez por visita.
 */
@Injectable()
export class MonitoreoPermanenciaService {
  private readonly logger = new Logger(MonitoreoPermanenciaService.name);
  private ultimaRevision: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly visitantes: VisitantesService,
    private readonly eventos: PublicadorEventos,
  ) {}

  @Cron('*/2 * * * *')
  async revisarPermanencia(ahora = new Date()): Promise<ResultadoRevision> {
    this.ultimaRevision = ahora;
    const enPlanta = await this.prisma.visita.findMany({
      where: { estado: EstadoVisita.EN_PLANTA, horaIngreso: { not: null }, alertaPermanenciaEn: null },
      include: { visitante: true, anfitrion: { select: { nombre: true } } },
    });

    const alertadas: string[] = [];
    for (const visita of enPlanta) {
      const limite = visita.horaIngreso!.getTime() + visita.tiempoAutorizadoMin * 60_000;
      if (ahora.getTime() <= limite) continue;

      const minutosExcedidos = Math.floor((ahora.getTime() - limite) / 60_000);
      // Marca atómica: si otra instancia ya alertó, `count` será 0 y no se duplica el aviso
      const { count } = await this.prisma.visita.updateMany({
        where: { id: visita.id, alertaPermanenciaEn: null },
        data: { alertaPermanenciaEn: ahora },
      });
      if (count === 0) continue;

      const publico = this.visitantes.resumen(visita.visitante);
      const evento: EventoAlertaPermanencia = {
        tipo: TipoEvento.ALERTA_PERMANENCIA,
        actor: ACTOR_SISTEMA,
        visitaId: visita.id,
        entidad: 'visita',
        entidadId: visita.id,
        resultado: `permanencia excedida en ${minutosExcedidos} min (autorizados ${visita.tiempoAutorizadoMin})`,
        detalle: { horaIngreso: visita.horaIngreso!.toISOString(), tiempoAutorizadoMin: visita.tiempoAutorizadoMin, minutosExcedidos },
        fecha: ahora,
        nombreVisitante: publico.nombreCompleto,
        empresa: publico.empresa,
        nombreAnfitrion: visita.anfitrion.nombre,
        horaIngreso: visita.horaIngreso!,
        tiempoAutorizadoMin: visita.tiempoAutorizadoMin,
        minutosExcedidos,
      };
      this.eventos.publicar(Eventos.ALERTA_PERMANENCIA, evento);
      alertadas.push(visita.id);
    }

    if (alertadas.length > 0) {
      this.logger.warn(`Permanencia excedida en ${alertadas.length} visita(s)`);
    }
    return { revisadas: enPlanta.length, alertadas };
  }

  estado() {
    return { intervalo: 'cada 2 minutos', ultimaRevision: this.ultimaRevision };
  }
}
