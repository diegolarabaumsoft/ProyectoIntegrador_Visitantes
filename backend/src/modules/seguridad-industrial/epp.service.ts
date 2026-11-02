import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import type { EntregaEpp } from '../../generated/prisma/client.js';
import { ElementoEpp, EstadoVisita, TipoEvento } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

export interface EstadoEpp {
  obligatorios: ElementoEpp[];
  entregados: EntregaEpp[];
  faltantes: ElementoEpp[];
  completo: boolean;
}

export interface ResultadoDevolucion {
  devueltos: ElementoEpp[];
  pendientes: ElementoEpp[];
}

/** Nombres legibles para mostrar en la interfaz */
export const NOMBRE_EPP: Record<ElementoEpp, string> = {
  [ElementoEpp.CASCO]: 'Casco',
  [ElementoEpp.GAFAS]: 'Gafas de seguridad',
  [ElementoEpp.TAPABOCAS]: 'Tapabocas',
  [ElementoEpp.PROTECTOR_AUDITIVO]: 'Protector auditivo',
  [ElementoEpp.CHALECO]: 'Chaleco reflectivo',
  [ElementoEpp.BOTAS]: 'Botas de seguridad',
  [ElementoEpp.OTRO]: 'Otro',
};

/**
 * Gestión de Equipos de Protección Personal (EPP) para visitas industriales (HU-31).
 *
 * Contrato compartido (sección 12.6):
 *   estado(visitaId)                              → EstadoEpp
 *   registrarEntrega(visitaId, elementos, usuario) → EstadoEpp
 *   registrarDevolucion(visitaId, devueltos, usuario) → ResultadoDevolucion
 */
@Injectable()
export class EppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
  ) {}

  // ─── helpers internos ────────────────────────────────────────────────────────

  private async obtenerVisita(visitaId: string) {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId } });
    if (!visita) {
      throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    }
    if (visita.estado === EstadoVisita.FINALIZADA || visita.estado === EstadoVisita.CANCELADA) {
      throw new ConflictException({
        codigo: 'VISITA_CERRADA',
        mensaje: `No se puede registrar EPP en una visita ${visita.estado.toLowerCase()}`,
      });
    }
    return visita;
  }

  private async obligatorios(): Promise<ElementoEpp[]> {
    const lista = await this.configuracion.lista('epp_obligatorio');
    // Filtramos solo los valores válidos del enum
    return lista.filter((v): v is ElementoEpp => v in ElementoEpp) as ElementoEpp[];
  }

  // ─── contrato compartido ─────────────────────────────────────────────────────

  async estado(visitaId: string): Promise<EstadoEpp> {
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId } });
    if (!visita) {
      throw new NotFoundException({ codigo: 'VISITA_NO_ENCONTRADA', mensaje: 'Visita no encontrada' });
    }
    const [entregados, obligatoriosLista] = await Promise.all([
      this.prisma.entregaEpp.findMany({ where: { visitaId } }),
      this.obligatorios(),
    ]);
    const entregadosElementos = entregados.filter((e) => e.entregado).map((e) => e.elemento);
    const faltantes = obligatoriosLista.filter((el) => !entregadosElementos.includes(el));
    return {
      obligatorios: obligatoriosLista,
      entregados,
      faltantes,
      completo: faltantes.length === 0,
    };
  }

  async registrarEntrega(
    visitaId: string,
    elementos: { elemento: ElementoEpp; entregado: boolean }[],
    usuario: UsuarioAutenticado,
    ip?: string,
  ): Promise<EstadoEpp> {
    await this.obtenerVisita(visitaId);

    // Upsert por [visitaId, elemento]
    await Promise.all(
      elementos.map((item) =>
        this.prisma.entregaEpp.upsert({
          where: { visitaId_elemento: { visitaId, elemento: item.elemento } },
          create: {
            visitaId,
            elemento: item.elemento,
            entregado: item.entregado,
            registradoPorId: usuario.id,
          },
          update: {
            entregado: item.entregado,
            entregadoEn: new Date(),
            registradoPorId: usuario.id,
          },
        }),
      ),
    );

    const estadoActual = await this.estado(visitaId);

    this.eventos.publicar(Eventos.EPP_REGISTRADO, {
      tipo: TipoEvento.EPP_ENTREGADO,
      actor: usuario.nombre,
      actorId: usuario.id,
      visitaId,
      resultado: estadoActual.completo ? 'EPP completo' : `Faltantes: ${estadoActual.faltantes.join(', ')}`,
      detalle: { elementos: elementos.map((e) => e.elemento), completo: estadoActual.completo },
      ip,
    });

    return estadoActual;
  }

  async registrarDevolucion(
    visitaId: string,
    devueltos: ElementoEpp[],
    usuario: UsuarioAutenticado,
    ip?: string,
  ): Promise<ResultadoDevolucion> {
    await this.obtenerVisita(visitaId);

    // Solo cuenta como devuelto lo que estaba entregado y seguía pendiente
    const marcados = await Promise.all(
      devueltos.map(async (elemento) => {
        const { count } = await this.prisma.entregaEpp.updateMany({
          where: { visitaId, elemento, entregado: true, devuelto: false },
          data: { devuelto: true, devueltoEn: new Date() },
        });
        return count > 0 ? elemento : null;
      }),
    );
    const efectivos = marcados.filter((e): e is ElementoEpp => e !== null);

    // Calcular pendientes (entregados y no devueltos aún)
    const restantes = await this.prisma.entregaEpp.findMany({
      where: { visitaId, entregado: true, devuelto: false },
      orderBy: { elemento: 'asc' },
    });
    const pendientes = restantes.map((e) => e.elemento);

    if (efectivos.length > 0) {
      this.eventos.publicar(Eventos.EPP_DEVUELTO, {
        tipo: TipoEvento.EPP_DEVUELTO,
        actor: usuario.nombre,
        actorId: usuario.id,
        visitaId,
        resultado: `Devueltos: ${efectivos.join(', ')}`,
        detalle: { elementos: efectivos, pendientes },
        ip,
      });
    }

    return { devueltos: efectivos, pendientes };
  }
}
