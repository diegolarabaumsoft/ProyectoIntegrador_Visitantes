import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto.js';

export class ListarRestriccionesDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre de referencia o motivo' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: true, description: 'Filtrar por estado activo (por defecto true)' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activa?: boolean = true;
}
