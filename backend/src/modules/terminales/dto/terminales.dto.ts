import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { TipoTerminal } from '../../../generated/prisma/enums.js';

export class CrearTerminalDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @ApiProperty({ enum: TipoTerminal })
  @IsEnum(TipoTerminal)
  tipo!: TipoTerminal;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatoria en los lectores de zona' })
  @IsOptional()
  @IsUUID()
  zonaId?: string;

  @ApiProperty({ description: 'Dirección del terminal en la red de la planta' })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  ip!: string;
}

export class EditarTerminalDto extends PartialType(CrearTerminalDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
