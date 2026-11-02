import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CambiarContrasenaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  actual!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'La contraseña nueva debe tener al menos 10 caracteres' })
  @MaxLength(128)
  nueva!: string;
}
