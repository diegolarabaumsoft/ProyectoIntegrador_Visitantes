import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { CredencialesService } from './credenciales.service.js';

export class ValidarCredencialDto {
  @ApiProperty({ description: 'Contenido del código QR' })
  @IsString()
  @MinLength(20)
  codigo!: string;
}

@ApiTags('Credenciales')
@ApiCookieAuth('vms_access')
@Controller('credenciales')
export class CredencialesController {
  constructor(private readonly credenciales: CredencialesService) {}

  @Post('validar')
  @HttpCode(200)
  @Roles(Rol.RECEPCION_SEGURIDAD, Rol.JEFE_SEGURIDAD, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Valida firma, vigencia y estado de una credencial QR (HU-07)' })
  async validar(@Body() dto: ValidarCredencialDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    const resultado = await this.credenciales.validar(dto.codigo, usuario.nombre, usuario.id);
    if (resultado.valida) {
      return { valida: true, visitaId: resultado.visitaId, venceEn: resultado.credencial.venceEn };
    }
    return { valida: false, motivo: resultado.motivo, mensaje: resultado.mensaje, visitaId: resultado.visitaId ?? null };
  }
}
