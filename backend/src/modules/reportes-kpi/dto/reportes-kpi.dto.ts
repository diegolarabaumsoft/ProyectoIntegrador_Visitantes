import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEmail, IsEnum, IsIn, IsNumber, IsOptional, Matches } from 'class-validator';
import { NombreIndicador, OperadorUmbral, PeriodicidadReporte } from '../../../generated/prisma/enums.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class RecalcularDto {
  @ApiProperty({ example: '2026-11-01', description: 'Día en hora de Bogotá' })
  @Matches(FECHA, { message: 'Use el formato AAAA-MM-DD' })
  fecha!: string;
}

export const TIPOS_REPORTE = ['VISITAS', 'INCIDENCIAS', 'KPI'] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export class GenerarReporteDto {
  @ApiProperty({ enum: TIPOS_REPORTE })
  @IsIn(TIPOS_REPORTE)
  tipo!: TipoReporte;

  @ApiProperty({ example: '2026-11-01' })
  @Matches(FECHA, { message: 'Use el formato AAAA-MM-DD' })
  desde!: string;

  @ApiProperty({ example: '2026-11-30' })
  @Matches(FECHA, { message: 'Use el formato AAAA-MM-DD' })
  hasta!: string;
}

export class ProgramacionDto {
  @ApiPropertyOptional({ enum: PeriodicidadReporte, nullable: true, description: 'Nula para desactivar el envío' })
  @IsOptional()
  @IsEnum(PeriodicidadReporte)
  periodicidad?: PeriodicidadReporte | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true, message: 'Hay un destinatario con un correo no válido' })
  destinatarios!: string[];
}

export class CrearAlertaDto {
  @ApiProperty({ enum: NombreIndicador })
  @IsEnum(NombreIndicador)
  indicador!: NombreIndicador;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  umbral!: number;

  @ApiProperty({ enum: OperadorUmbral })
  @IsEnum(OperadorUmbral)
  operador!: OperadorUmbral;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true, message: 'Hay un destinatario con un correo no válido' })
  destinatarios!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class ActualizarAlertaDto extends PartialType(CrearAlertaDto) {}

export class ExportarAnonimizadoDto {
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
}
