import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto.js';
import { TipoEvento } from '../../../generated/prisma/enums.js';

export class ConsultarBitacoraDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: TipoEvento })
  @IsOptional()
  @IsEnum(TipoEvento)
  tipoEvento?: TipoEvento;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Parte del nombre del actor' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  actor?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  visitaId?: string;

  @ApiPropertyOptional({ description: 'Entidad de negocio afectada' })
  @IsOptional()
  @IsString()
  entidad?: string;

  @ApiPropertyOptional({ description: 'Identificador de la entidad afectada' })
  @IsOptional()
  @IsString()
  entidadId?: string;

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

export class ExportarBitacoraDto {
  @ApiPropertyOptional({ enum: ['csv'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv'])
  formato?: 'csv';

  @ApiPropertyOptional({ enum: TipoEvento })
  @IsOptional()
  @IsEnum(TipoEvento)
  tipoEvento?: TipoEvento;

  @ApiPropertyOptional({ description: 'Parte del nombre del actor' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  actor?: string;

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
