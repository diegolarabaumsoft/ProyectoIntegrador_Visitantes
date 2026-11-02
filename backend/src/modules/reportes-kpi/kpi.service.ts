import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';
import { MetodoId, NombreIndicador, ResultadoCotejo, TipoEvento } from '../../generated/prisma/enums.js';
import { AlertasService } from './alertas.service.js';
import { diaBogota, finDia, inicioDia, sumarDias } from './fechas.js';
import { ReportesService } from './reportes.service.js';

const EVENTOS_INICIO: TipoEvento[] = [TipoEvento.CREDENCIAL_RECHAZADA, TipoEvento.CHECKIN_BLOQUEADO, TipoEvento.EPP_ENTREGADO, TipoEvento.CHECKIN_REALIZADO, TipoEvento.COTEJO_EXITOSO, TipoEvento.HUELLA_ENROLADA];

const fechaPeriodo = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

/** Percentil por rango más cercano. */
function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.max(0, Math.ceil((p / 100) * orden.length) - 1)];
}

/** Indicadores (HU-21): se calculan a las 06:00 para el día anterior, en hora de Bogotá. */
@Injectable()
export class KpiService {
  private readonly logger = new Logger(KpiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertas: AlertasService,
    private readonly reportes: ReportesService,
  ) {}

  @Cron('0 6 * * *', { timeZone: 'America/Bogota' })
  async tareaDiaria(): Promise<void> {
    const ayer = sumarDias(diaBogota(new Date()), -1);
    const valores = await this.calcularDia(ayer);
    // Las encuestas llegan después del cálculo: se actualiza la última semana
    for (let i = 1; i <= 6; i++) await this.calcularDia(sumarDias(ayer, -i));
    const disparadas = await this.alertas.evaluar(ayer, valores);
    const enviado = await this.reportes.enviarProgramado(ayer);
    this.logger.log(`KPI de ${ayer}: ${disparadas} alerta(s), reporte programado ${enviado ? 'enviado' : 'no aplica'}`);
  }

  async calcularDia(fecha: string): Promise<Map<NombreIndicador, number>> {
    const rango = { gte: inicioDia(fecha), lte: finDia(fecha) };
    const visitas = await this.prisma.visita.findMany({
      where: { horaIngreso: rango },
      select: {
        id: true,
        horaIngreso: true,
        metodoIdentificacion: true,
        satisfaccion: true,
        consentimiento: { select: { aceptaTratamiento: true, aceptaNda: true } },
        visitante: { select: { numeroDocumentoHash: true, inducciones: { where: { aprobada: true }, select: { id: true }, take: 1 } } },
        eventos: { where: { tipoEvento: { in: EVENTOS_INICIO }, fechaHora: rango }, orderBy: { fechaHora: 'asc' }, take: 1, select: { fechaHora: true } },
      },
    });
    const tiempoDe = (v: (typeof visitas)[number]) => Math.max(0, (v.horaIngreso!.getTime() - (v.eventos[0]?.fechaHora.getTime() ?? v.horaIngreso!.getTime())) / 1000);
    const tiempos = visitas.map(tiempoDe);
    // RNF-01 fija metas distintas: 1 minuto con huella ya enrolada y 3 con enrolamiento
    const enrolamientos = await this.prisma.eventoBitacora.findMany({ where: { tipoEvento: TipoEvento.HUELLA_ENROLADA, fechaHora: rango }, select: { visitaId: true } });
    const conEnrolamiento = new Set(enrolamientos.map((e) => e.visitaId));
    const conHuella = visitas.filter((v) => v.metodoIdentificacion === MetodoId.HUELLA);
    const enroladas = conHuella.filter((v) => !conEnrolamiento.has(v.id)).map(tiempoDe);
    const primeraVisita = conHuella.filter((v) => conEnrolamiento.has(v.id)).map(tiempoDe);
    const cotejos = await this.prisma.eventoCotejo.groupBy({ by: ['resultado'], where: { fechaHora: rango }, _count: { _all: true } });
    const totalCotejos = cotejos.reduce((suma, c) => suma + c._count._all, 0);
    const aceptados = cotejos.find((c) => c.resultado === ResultadoCotejo.COINCIDE)?._count._all ?? 0;
    const completas = visitas.filter((v) => v.consentimiento?.aceptaTratamiento && v.consentimiento.aceptaNda && v.visitante.inducciones.length > 0 && v.visitante.numeroDocumentoHash !== '').length;
    const puntajes = visitas.flatMap((v) => (v.satisfaccion === null ? [] : [v.satisfaccion]));
    const [bloqueos, contingencias] = await Promise.all([
      this.prisma.eventoBitacora.count({ where: { tipoEvento: TipoEvento.CHECKIN_BLOQUEADO, fechaHora: rango } }),
      this.prisma.visita.count({ where: { horaIngreso: rango, modoContingencia: true } }),
    ]);

    const valores = new Map<NombreIndicador, number>([
      [NombreIndicador.VISITAS_DIA, visitas.length],
      [NombreIndicador.TIEMPO_CHECKIN_PROMEDIO, tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0],
      [NombreIndicador.TIEMPO_CHECKIN_P90, Math.round(percentil(tiempos, 90))],
      [NombreIndicador.COMPLETITUD_REGISTRO, visitas.length ? Math.round((completas / visitas.length) * 100) : 0],
      [NombreIndicador.BLOQUEOS, bloqueos],
      [NombreIndicador.CONTINGENCIAS, contingencias],
    ]);
    // Sin datos no se escribe un cero: parecería un resultado perfecto
    if (totalCotejos) valores.set(NombreIndicador.TASA_RECHAZO_BIOMETRICO, Math.round(((totalCotejos - aceptados) / totalCotejos) * 1000) / 10);
    if (enroladas.length) valores.set(NombreIndicador.TIEMPO_CHECKIN_P90_ENROLADO, Math.round(percentil(enroladas, 90)));
    if (primeraVisita.length) valores.set(NombreIndicador.TIEMPO_CHECKIN_P90_PRIMERA_VISITA, Math.round(percentil(primeraVisita, 90)));
    if (puntajes.length) valores.set(NombreIndicador.SATISFACCION, Math.round((puntajes.reduce((a, b) => a + b, 0) / puntajes.length) * 10) / 10);

    const periodo = fechaPeriodo(fecha);
    await Promise.all(
      [...valores].map(([nombre, valor]) =>
        this.prisma.indicador.upsert({ where: { nombre_periodo: { nombre, periodo } }, update: { valor, fechaCalculo: new Date() }, create: { nombre, periodo, valor } }),
      ),
    );
    return valores;
  }

  /** Valores del último día calculado y la serie de visitas de los últimos 7 días hasta ese día. */
  async tablero() {
    const ultimo = await this.prisma.indicador.findFirst({ orderBy: { periodo: 'desc' }, select: { periodo: true } });
    if (!ultimo) return { periodo: null, calculadoEn: null, valores: {}, serie: [] };
    const filas = await this.prisma.indicador.findMany({ where: { periodo: ultimo.periodo } });
    const fin = ultimo.periodo.toISOString().slice(0, 10);
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(fin, i - 6));
    const serie = await this.prisma.indicador.findMany({ where: { nombre: NombreIndicador.VISITAS_DIA, periodo: { gte: fechaPeriodo(dias[0]), lte: ultimo.periodo } } });
    const porDia = new Map(serie.map((s) => [s.periodo.toISOString().slice(0, 10), s.valor]));
    return {
      periodo: fin,
      calculadoEn: filas.reduce<Date | null>((m, f) => (!m || f.fechaCalculo > m ? f.fechaCalculo : m), null),
      valores: Object.fromEntries(filas.map((f) => [f.nombre, f.valor])),
      serie: dias.map((dia) => ({ dia, valor: porDia.get(dia) ?? 0 })),
    };
  }

  indicadores() {
    return this.prisma.indicador.findMany({ orderBy: [{ periodo: 'desc' }, { nombre: 'asc' }], take: 500 });
  }
}
