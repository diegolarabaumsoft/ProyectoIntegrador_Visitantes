import { Body, Controller, Get, Ip, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UnprocessableEntityException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Min, MinLength } from 'class-validator';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { Rol, TipoEvento } from '../../generated/prisma/enums.js';

export class CrearPreguntaDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  enunciado!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  opciones!: string[];

  @ApiProperty({ description: 'Posición de la opción correcta, desde 0' })
  @IsInt()
  @Min(0)
  respuestaCorrecta!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  orden!: number;
}

export class ActualizarPreguntaDto extends PartialType(CrearPreguntaDto) {}

@ApiTags('Inducción')
@ApiCookieAuth('vms_access')
@Roles(Rol.ADMINISTRADOR)
@Controller('induccion/preguntas')
export class PreguntasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: PublicadorEventos,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Preguntas con su respuesta correcta' })
  listar() {
    return this.prisma.preguntaInduccion.findMany({ orderBy: { orden: 'asc' } });
  }

  @Post()
  @ApiOperation({ summary: 'Crea una pregunta' })
  async crear(@Body() dto: CrearPreguntaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    this.exigirRespuesta(dto.opciones, dto.respuestaCorrecta);
    const pregunta = await this.prisma.preguntaInduccion.create({ data: dto });
    this.auditar('pregunta creada', pregunta.id, usuario, ip);
    return pregunta;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica una pregunta' })
  async actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarPreguntaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    const actual = await this.exigir(id);
    this.exigirRespuesta(dto.opciones ?? (actual.opciones as string[]), dto.respuestaCorrecta ?? actual.respuestaCorrecta);
    const pregunta = await this.prisma.preguntaInduccion.update({ where: { id }, data: dto });
    this.auditar('pregunta modificada', id, usuario, ip);
    return pregunta;
  }

  @Patch(':id/desactivar')
  @ApiOperation({ summary: 'Retira una pregunta de la evaluación' })
  async desactivar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    await this.exigir(id);
    const activas = await this.prisma.preguntaInduccion.count({ where: { activa: true, id: { not: id } } });
    if (activas === 0) throw new UnprocessableEntityException({ codigo: 'ULTIMA_PREGUNTA', mensaje: 'La inducción debe conservar al menos una pregunta activa' });
    const pregunta = await this.prisma.preguntaInduccion.update({ where: { id }, data: { activa: false } });
    this.auditar('pregunta desactivada', id, usuario, ip);
    return pregunta;
  }

  private async exigir(id: string) {
    const pregunta = await this.prisma.preguntaInduccion.findUnique({ where: { id } });
    if (!pregunta) throw new NotFoundException({ codigo: 'PREGUNTA_NO_ENCONTRADA', mensaje: 'La pregunta no existe' });
    return pregunta;
  }

  private exigirRespuesta(opciones: string[], correcta: number): void {
    if (correcta >= opciones.length) throw new UnprocessableEntityException({ codigo: 'RESPUESTA_INVALIDA', mensaje: 'La respuesta correcta debe ser una de las opciones' });
  }

  private auditar(resultado: string, id: string, usuario: UsuarioAutenticado, ip?: string): void {
    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, { tipo: TipoEvento.CONFIGURACION_MODIFICADA, actor: usuario.nombre, actorId: usuario.id, entidad: 'pregunta_induccion', entidadId: id, resultado, ip });
  }
}
