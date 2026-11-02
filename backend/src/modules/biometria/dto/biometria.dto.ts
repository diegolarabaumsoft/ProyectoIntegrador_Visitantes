import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, ValidateIf, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Dedo } from '../../../generated/prisma/enums.js';

export class MuestraHuellaDto {
  @ApiProperty({ enum: Dedo })
  @IsEnum(Dedo)
  dedo!: Dedo;

  @ApiProperty({ description: 'Formato de la plantilla entregada por el puente' })
  @IsString()
  @MaxLength(40)
  formato!: string;

  @ApiProperty({ description: 'Plantilla en texto. Nunca una imagen (RNF-09)' })
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  plantilla!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  calidad!: number;

  @ApiProperty()
  @IsBoolean()
  pruebaVida!: boolean;
}

/** Una lectura válida del puente, o el motivo por el que no la hubo (cuenta para la tasa de rechazo). */
export class IdentificarHuellaDto {
  @ApiPropertyOptional({ enum: ['CALIDAD_BAJA', 'PRUEBA_VIDA_FALLIDA'] })
  @IsOptional()
  @IsIn(['CALIDAD_BAJA', 'PRUEBA_VIDA_FALLIDA'])
  motivo?: 'CALIDAD_BAJA' | 'PRUEBA_VIDA_FALLIDA';

  @ApiPropertyOptional()
  @ValidateIf((o: IdentificarHuellaDto) => !o.motivo)
  @IsString()
  @MaxLength(40)
  formato?: string;

  @ApiPropertyOptional({ description: 'Plantilla en texto. Nunca una imagen (RNF-09)' })
  @ValidateIf((o: IdentificarHuellaDto) => !o.motivo)
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  plantilla?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @ValidateIf((o: IdentificarHuellaDto) => !o.motivo)
  @IsInt()
  @Min(0)
  @Max(100)
  calidad?: number;

  @ApiPropertyOptional()
  @ValidateIf((o: IdentificarHuellaDto) => !o.motivo)
  @IsBoolean()
  pruebaVida?: boolean;
}

export class EnrolarHuellaDto {
  @ApiProperty({ description: 'Recepción comparó el documento físico con los datos del pre-registro (HU-06)' })
  @IsBoolean()
  @Equals(true, { message: 'Confirme el documento físico antes de enrolar la huella' })
  identidadConfirmada!: boolean;

  @ApiProperty({ type: [MuestraHuellaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MuestraHuellaDto)
  muestras!: MuestraHuellaDto[];
}
