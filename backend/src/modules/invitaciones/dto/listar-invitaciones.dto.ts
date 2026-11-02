import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto.js';
import { EstadoVisita } from '../../../generated/prisma/enums.js';

export class ListarInvitacionesDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: EstadoVisita })
  @IsOptional()
  @IsEnum(EstadoVisita)
  estado?: EstadoVisita;

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

  @ApiPropertyOptional({ description: 'Búsqueda por empresa o motivo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ReprogramarInvitacionDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate({ message: 'La nueva fecha no es válida' })
  fechaVisita!: Date;
}
