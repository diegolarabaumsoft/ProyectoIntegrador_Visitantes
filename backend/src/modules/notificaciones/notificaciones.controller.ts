import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { EstadoNotificacion, Rol } from '../../generated/prisma/enums.js';
import { NotificacionesService } from './notificaciones.service.js';

export class ListarNotificacionesDto extends PaginacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ enum: EstadoNotificacion })
  @IsOptional()
  @IsEnum(EstadoNotificacion)
  estado?: EstadoNotificacion;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  visitaId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;
}

@ApiTags('Notificaciones')
@ApiCookieAuth('vms_access')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.DPO, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Historial de notificaciones' })
  listar(@Query() dto: ListarNotificacionesDto) {
    return this.notificaciones.listar(dto);
  }

  @Post(':id/reintentar')
  @HttpCode(200)
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Reenvía una notificación fallida' })
  reintentar(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificaciones.reintentar(id);
  }
}
