import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConsultarPresentesDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en la empresa o el nombre del visitante' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class RegistrarMovimientoDto {
  @ApiProperty()
  @IsUUID()
  zonaId!: string;
}

export class AsignarAcompananteDto {
  @ApiProperty({ description: 'Usuario interno activo responsable de la visita' })
  @IsUUID()
  acompananteId!: string;
}
