import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TipoDocumento } from '../../../generated/prisma/enums.js';

/** Paso 1: solo los campos mínimos necesarios (HU-03, RNF-05). */
export class DatosPreRegistroDto {
  @ApiProperty({ example: 'Laura Comercial' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombreCompleto!: string;

  @ApiProperty({ enum: TipoDocumento })
  @IsEnum(TipoDocumento)
  tipoDocumento!: TipoDocumento;

  @ApiProperty({ example: '1020304050' })
  @IsString()
  @Matches(/^[A-Za-z0-9.\-\s]{5,30}$/, { message: 'El número de documento no es válido' })
  numeroDocumento!: string;

  @ApiProperty({ example: 'Textiles del Norte S.A.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  empresa!: string;

  @ApiProperty({ example: 'laura@textilesdelnorte.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo no es válido' })
  correo!: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s()-]{7,20}$/, { message: 'El teléfono no es válido' })
  telefono?: string;
}

/** Paso 2: ambas casillas obligatorias (HU-04). */
export class ConsentimientoDto {
  @ApiProperty({ description: 'Acepta el tratamiento de datos personales (Ley 1581 de 2012)' })
  @IsBoolean()
  @Equals(true, { message: 'Debe aceptar el tratamiento de datos personales' })
  aceptaTratamiento!: boolean;

  @ApiProperty({ description: 'Acepta el acuerdo de confidencialidad (NDA)' })
  @IsBoolean()
  @Equals(true, { message: 'Debe aceptar el acuerdo de confidencialidad' })
  aceptaNda!: boolean;

  @ApiPropertyOptional({ description: 'Autorización facultativa del tratamiento de la huella (HU-04). Sin ella se usa la credencial alternativa' })
  @IsOptional()
  @IsBoolean()
  autorizaBiometria?: boolean;
}

export class RespuestaInduccionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  preguntaId!: string;

  @ApiProperty({ description: 'Índice de la opción elegida (base 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  opcion!: number;
}

/** Paso 3: evaluación de la inducción (HU-32). */
export class EvaluarInduccionDto {
  @ApiProperty({ type: [RespuestaInduccionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RespuestaInduccionDto)
  respuestas!: RespuestaInduccionDto[];
}
