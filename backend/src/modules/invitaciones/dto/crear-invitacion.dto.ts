import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TipoDocumento } from '../../../generated/prisma/enums.js';

export class VisitanteInvitadoDto {
  @ApiProperty({ example: 'Laura Comercial' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombreCompleto!: string;

  @ApiProperty({ example: 'laura@textilesdelnorte.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo del visitante no es válido' })
  correo!: string;

  @ApiProperty({ example: 'Textiles del Norte S.A.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  empresa!: string;

  @ApiPropertyOptional({ enum: TipoDocumento })
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @ApiPropertyOptional({ example: '1020304050' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroDocumento?: string;
}

export class CrearInvitacionDto {
  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-15T09:00:00-05:00' })
  @Type(() => Date)
  @IsDate({ message: 'La fecha de la visita no es válida' })
  fechaVisita!: Date;

  @ApiProperty({ example: 'Revisión de materia prima' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  motivo!: string;

  @ApiPropertyOptional({ description: 'Tiempo de permanencia autorizado en minutos', default: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  tiempoAutorizadoMin?: number;

  @ApiProperty({ type: [VisitanteInvitadoDto], description: 'Uno o varios visitantes (visita grupal)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un visitante' })
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => VisitanteInvitadoDto)
  visitantes!: VisitanteInvitadoDto[];
}
