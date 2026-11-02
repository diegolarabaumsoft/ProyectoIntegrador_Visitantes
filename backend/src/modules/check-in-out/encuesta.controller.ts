import { Body, Controller, ForbiddenException, Get, GoneException, Injectable, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { EstadoVisita, TipoEvento } from '../../generated/prisma/enums.js';

export class ResponderEncuestaDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  puntaje!: number;
}

/**
 * Encuesta de satisfacción (V8). El enlace lleva un token propio firmado: el del
 * pre-registro solo se guarda como hash y no se puede reconstruir tras el check-out.
 */
@Injectable()
export class EncuestaService {
  private readonly jwt: JwtService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: PublicadorEventos,
    config: ConfigService<Env, true>,
  ) {
    // Secreto derivado: este token nunca puede pasar por una credencial QR ni al revés
    this.jwt = new JwtService({ secret: `${config.get('JWT_QR_SECRET', { infer: true })}:encuesta` });
  }

  firmar(visitaId: string): string {
    return this.jwt.sign({ sub: visitaId }, { expiresIn: '30d' });
  }

  async estado(token: string) {
    const visita = await this.visita(token);
    return { fechaVisita: visita.fechaProgramada, respondida: visita.satisfaccion !== null };
  }

  async responder(token: string, puntaje: number) {
    const { id } = await this.visita(token);
    const { count } = await this.prisma.visita.updateMany({ where: { id, estado: EstadoVisita.FINALIZADA, satisfaccion: null }, data: { satisfaccion: puntaje } });
    if (count === 0) throw new GoneException({ codigo: 'ENCUESTA_RESPONDIDA', mensaje: 'Esta encuesta ya fue respondida' });
    this.eventos.publicar(Eventos.SATISFACCION_REGISTRADA, { tipo: TipoEvento.SATISFACCION_REGISTRADA, actor: 'Visitante', visitaId: id, entidad: 'visita', entidadId: id, resultado: `satisfacción ${puntaje} de 5`, detalle: { puntaje } });
    return { registrada: true };
  }

  private async visita(token: string) {
    let visitaId: string;
    try {
      visitaId = this.jwt.verify<{ sub: string }>(token).sub;
    } catch {
      throw new ForbiddenException({ codigo: 'ENLACE_INVALIDO', mensaje: 'Este enlace de encuesta no es válido o ya venció' });
    }
    const visita = await this.prisma.visita.findUnique({ where: { id: visitaId }, select: { id: true, estado: true, fechaProgramada: true, satisfaccion: true } });
    if (visita?.estado !== EstadoVisita.FINALIZADA) throw new ForbiddenException({ codigo: 'ENLACE_INVALIDO', mensaje: 'Este enlace de encuesta no es válido o ya venció' });
    return visita;
  }
}

@ApiTags('Encuesta')
@Public()
@Controller('encuesta')
export class EncuestaController {
  constructor(private readonly encuesta: EncuestaService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Estado de la encuesta del enlace (público por token)' })
  estado(@Param('token') token: string) {
    return this.encuesta.estado(token);
  }

  @Post(':token')
  @ApiOperation({ summary: 'Registra el puntaje de 1 a 5 (público por token)' })
  responder(@Param('token') token: string, @Body() dto: ResponderEncuestaDto) {
    return this.encuesta.responder(token, dto.puntaje);
  }
}
