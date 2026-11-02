import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { ElementoEpp } from '../../../generated/prisma/enums.js';

export class DevolucionEppDto {
  @ApiProperty({
    enum: ElementoEpp,
    isArray: true,
    description: 'Elementos EPP devueltos por el visitante al salir',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ElementoEpp, { each: true })
  devueltos!: ElementoEpp[];
}
