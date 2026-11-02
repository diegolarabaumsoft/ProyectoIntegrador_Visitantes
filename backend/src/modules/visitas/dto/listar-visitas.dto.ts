import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto.js';
import { EstadoVisita } from '../../../generated/prisma/enums.js';

export class ListarVisitasDto extends PaginacionDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  empresa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  anfitrionId?: string;

  @ApiPropertyOptional({ enum: EstadoVisita })
  @IsOptional()
  @IsEnum(EstadoVisita)
  estado?: EstadoVisita;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  documento?: string;
}
