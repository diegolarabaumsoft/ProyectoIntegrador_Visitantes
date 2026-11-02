import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto.js';
import { Rol } from '../../../generated/prisma/enums.js';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearUsuarioDto {
  @ApiProperty({ example: 'Ana Ejemplo' })
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ example: 'ana.ejemplo@plantatextil.local' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  correo!: string;

  @ApiProperty({ enum: Rol, description: 'Cada usuario tiene exactamente un rol' })
  @IsEnum(Rol)
  rol!: Rol;

  @ApiPropertyOptional({ description: 'Solo aplica a anfitriones' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  area?: string;
}

export class ActualizarUsuarioDto extends PartialType(CrearUsuarioDto) {}

export class ListarUsuariosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: Rol })
  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  activo?: boolean;
}
