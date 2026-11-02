import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginacionDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;

  get skip(): number {
    return (this.pagina - 1) * this.limite;
  }
}

export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export function paginar<T>(datos: T[], total: number, dto: PaginacionDto): Paginado<T> {
  return {
    datos,
    total,
    pagina: dto.pagina,
    limite: dto.limite,
    totalPaginas: Math.max(1, Math.ceil(total / dto.limite)),
  };
}
