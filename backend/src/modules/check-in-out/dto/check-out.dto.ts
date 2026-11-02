import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ElementoEpp } from '../../../generated/prisma/enums.js';

export class EscanearCheckOutDto {
  @ApiPropertyOptional({ description: 'Contenido del código QR leído' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  codigo?: string;

  @ApiPropertyOptional({ description: 'Visita seleccionada de la lista de presentes' })
  @IsOptional()
  @IsUUID()
  visitaId?: string;
}

export class ConfirmarCheckOutDto {
  @ApiProperty()
  @IsBoolean()
  credencialDevuelta!: boolean;

  @ApiProperty({ enum: ElementoEpp, isArray: true, description: 'Elementos devueltos; lo entregado que no aparezca genera una incidencia' })
  @IsArray()
  @IsEnum(ElementoEpp, { each: true })
  eppDevuelto!: ElementoEpp[];
}
