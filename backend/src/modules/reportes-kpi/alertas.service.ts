import { Injectable, NotFoundException } from '@nestjs/common';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { OperadorUmbral, TipoEvento, type NombreIndicador } from '../../generated/prisma/enums.js';
import { correoAviso } from '../../integraciones/correo/plantillas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { ActualizarAlertaDto, CrearAlertaDto } from './dto/reportes-kpi.dto.js';

export const NOMBRE_INDICADOR: Record<NombreIndicador, string> = {
  TIEMPO_CHECKIN_P90: 'Tiempo de check-in p90 (s)',
  TIEMPO_CHECKIN_PROMEDIO: 'Tiempo promedio de check-in (s)',
  COMPLETITUD_REGISTRO: 'Completitud del registro (%)',
  SATISFACCION: 'Satisfacción (1 a 5)',
  VISITAS_DIA: 'Visitas del día',
  BLOQUEOS: 'Bloqueos',
  CONTINGENCIAS: 'Contingencias',
  TASA_RECHAZO_BIOMETRICO: 'Tasa de rechazo biométrico (%)',
  TIEMPO_CHECKIN_P90_ENROLADO: 'Check-in p90 con huella ya enrolada (s)',
  TIEMPO_CHECKIN_P90_PRIMERA_VISITA: 'Check-in p90 con enrolamiento (s)',
};

/** Alertas por umbral (HU-24): se evalúan tras el cálculo diario de indicadores. */
@Injectable()
export class AlertasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    private readonly eventos: PublicadorEventos,
  ) {}

  listar() {
    return this.prisma.alertaUmbral.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async crear(dto: CrearAlertaDto, usuario: UsuarioAutenticado, ip?: string) {
    const alerta = await this.prisma.alertaUmbral.create({ data: dto });
    this.auditar('alerta creada', alerta.id, usuario, ip);
    return alerta;
  }

  async actualizar(id: string, dto: ActualizarAlertaDto, usuario: UsuarioAutenticado, ip?: string) {
    await this.exigir(id);
    const alerta = await this.prisma.alertaUmbral.update({ where: { id }, data: dto });
    this.auditar('alerta modificada', id, usuario, ip);
    return alerta;
  }

  async eliminar(id: string, usuario: UsuarioAutenticado, ip?: string): Promise<void> {
    await this.exigir(id);
    await this.prisma.alertaUmbral.delete({ where: { id } });
    this.auditar('alerta eliminada', id, usuario, ip);
  }

  /** Avisa de cada alerta activa cuyo indicador del día cruzó el umbral. */
  async evaluar(fecha: string, valores: Map<NombreIndicador, number>): Promise<number> {
    const alertas = await this.prisma.alertaUmbral.findMany({ where: { activa: true } });
    let disparadas = 0;
    for (const alerta of alertas) {
      const valor = valores.get(alerta.indicador);
      if (valor === undefined) continue;
      const cruzo = alerta.operador === OperadorUmbral.MAYOR ? valor > alerta.umbral : valor < alerta.umbral;
      if (!cruzo) continue;
      disparadas++;
      const correo = correoAviso({
        asunto: `Alerta de indicador: ${NOMBRE_INDICADOR[alerta.indicador]}`,
        titulo: 'Indicador fuera del umbral',
        tono: 'alerta',
        introduccion: `El indicador del ${fecha} cruzó el umbral configurado.`,
        datos: [
          { etiqueta: 'Indicador', valor: NOMBRE_INDICADOR[alerta.indicador] },
          { etiqueta: 'Valor', valor: String(valor) },
          { etiqueta: 'Umbral', valor: `${alerta.operador === OperadorUmbral.MAYOR ? 'mayor que' : 'menor que'} ${alerta.umbral}` },
        ],
      });
      await Promise.all(alerta.destinatarios.map((destinatario) => this.notificaciones.enviarCorreo({ destinatario, ...correo, tipo: 'ALERTA_UMBRAL' })));
    }
    return disparadas;
  }

  private async exigir(id: string): Promise<void> {
    const existe = await this.prisma.alertaUmbral.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundException({ codigo: 'ALERTA_NO_ENCONTRADA', mensaje: 'La alerta no existe' });
  }

  private auditar(resultado: string, id: string, usuario: UsuarioAutenticado, ip?: string): void {
    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, { tipo: TipoEvento.CONFIGURACION_MODIFICADA, actor: usuario.nombre, actorId: usuario.id, entidad: 'alerta_umbral', entidadId: id, resultado, ip });
  }
}
