import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ActualizarRestriccionDto {
  @ApiPropertyOptional({ example: 'Carlos Mendoza Gómez', description: 'Nombre de referencia' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombreReferencia?: string;

  @ApiPropertyOptional({ example: 'Actualización de motivo de restricción', description: 'Motivo de la restricción' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo?: string;
}
