import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ActualizarZonaDto {
  @ApiPropertyOptional({ example: 'Tintorería Principal', description: 'Nombre de la zona de la planta' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Indica si es un área sensible' })
  @IsOptional()
  @IsBoolean()
  esSensible?: boolean;

  @ApiPropertyOptional({ description: 'Indica si requiere acompañante obligatorio' })
  @IsOptional()
  @IsBoolean()
  requiereAcompanante?: boolean;

  @ApiPropertyOptional({ description: 'Indica si la zona está activa' })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
