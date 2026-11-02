import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearZonaDto {
  @ApiProperty({ example: 'Tintorería', description: 'Nombre de la zona de la planta (único)' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @ApiPropertyOptional({ default: false, description: 'Indica si es un área sensible de la planta' })
  @IsOptional()
  @IsBoolean()
  esSensible?: boolean = false;

  @ApiPropertyOptional({ default: false, description: 'Indica si requiere acompañante obligatorio' })
  @IsOptional()
  @IsBoolean()
  requiereAcompanante?: boolean = false;
}
