import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearRestriccionDto {
  @ApiProperty({ example: '1020304050', description: 'Número de documento de identidad del visitante a restringir' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  numeroDocumento!: string;

  @ApiProperty({ example: 'Carlos Mendoza', description: 'Nombre completo o de referencia de la persona' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  nombreReferencia!: string;

  @ApiProperty({ example: 'Incumplimiento grave de normas de seguridad física', description: 'Motivo de la restricción' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  motivo!: string;
}
