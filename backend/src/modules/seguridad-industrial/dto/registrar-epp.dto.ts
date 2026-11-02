import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { ElementoEpp } from '../../../generated/prisma/enums.js';

export class ItemEppDto {
  @ApiProperty({ enum: ElementoEpp, description: 'Elemento de EPP' })
  @IsEnum(ElementoEpp)
  elemento!: ElementoEpp;

  @ApiProperty({ description: 'Indica si el elemento fue entregado al visitante' })
  @IsBoolean()
  entregado!: boolean;
}

export class RegistrarEppDto {
  @ApiProperty({ type: [ItemEppDto], description: 'Lista de elementos EPP a registrar' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ItemEppDto)
  elementos!: ItemEppDto[];
}
