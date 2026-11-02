import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TipoDocumento } from '../../../generated/prisma/enums.js';

export class EscanearDto {
  @ApiProperty({ description: 'Contenido del código QR leído' })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  codigo!: string;
}

export class BuscarVisitaDto {
  @ApiPropertyOptional({ example: '1020304050' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  documento?: string;

  @ApiPropertyOptional({ example: 'Laura', description: 'Solo busca entre las visitas de hoy (±1 día)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;
}

export class VehiculoDto {
  @ApiProperty({ example: 'ABC123' })
  @IsString()
  @Matches(/^[A-Za-z0-9\- ]{3,10}$/, { message: 'La placa no es válida' })
  placa!: string;

  @ApiPropertyOptional({ example: 'Camioneta' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tipo?: string;
}

export class ConfirmarCheckInDto {
  @ApiProperty({ description: 'Recepción confirmó la identidad con el documento físico', example: true })
  @Equals(true, { message: 'Debe confirmar la identidad con el documento físico' })
  identidadVerificada!: boolean;

  @ApiPropertyOptional({ type: VehiculoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VehiculoDto)
  vehiculo?: VehiculoDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  acompananteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  zonaId?: string;
}

export class RegistrarExcepcionDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  justificacion!: string;

  @ApiProperty({ example: 'Carlos Ejemplo, Jefe de Seguridad', description: 'Nombre y cargo de quien autoriza' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  autorizadoPor!: string;
}

export class RegistroExpresDto {
  @ApiProperty({ example: 'Pedro Proveedor' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombreCompleto!: string;

  @ApiProperty({ enum: TipoDocumento })
  @IsEnum(TipoDocumento)
  tipoDocumento!: TipoDocumento;

  @ApiProperty({ example: '79111222' })
  @IsString()
  @Matches(/^[A-Za-z0-9.\-\s]{5,30}$/, { message: 'El número de documento no es válido' })
  numeroDocumento!: string;

  @ApiProperty({ example: 'Servicios Industriales S.A.S.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  empresa!: string;

  @ApiPropertyOptional({ description: 'Opcional en el registro exprés' })
  @IsOptional()
  @IsEmail()
  correo?: string;

  @ApiProperty()
  @IsUUID()
  anfitrionId!: string;

  @ApiProperty({ example: 'Mantenimiento de calderas' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  motivo!: string;

  @ApiPropertyOptional({ description: 'Por defecto, permanencia_default_min' })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  tiempoAutorizadoMin?: number;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Debe aceptar el tratamiento de datos' })
  aceptaTratamiento!: boolean;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Debe aceptar el acuerdo de confidencialidad' })
  aceptaNda!: boolean;

  @ApiPropertyOptional({ description: 'Autorización facultativa de la huella; se enrola en el mismo acto (HU-11)' })
  @IsOptional()
  @IsBoolean()
  autorizaBiometria?: boolean;
}

export const MOTIVOS_CREDENCIAL_ALTERNATIVA = ['HUELLA_ILEGIBLE', 'HUELLERO_NO_DISPONIBLE', 'VISITANTE_NO_DESEA'] as const;

export class EmitirCredencialAlternativaDto {
  @ApiProperty({ enum: MOTIVOS_CREDENCIAL_ALTERNATIVA })
  @IsIn(MOTIVOS_CREDENCIAL_ALTERNATIVA)
  motivo!: (typeof MOTIVOS_CREDENCIAL_ALTERNATIVA)[number];
}

export class RespuestaInduccionDto {
  @ApiProperty()
  @IsUUID()
  preguntaId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  opcion!: number;
}

export class EvaluarInduccionDto {
  @ApiProperty({ type: [RespuestaInduccionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RespuestaInduccionDto)
  respuestas!: RespuestaInduccionDto[];
}
