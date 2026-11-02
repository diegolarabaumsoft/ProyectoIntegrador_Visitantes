import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { CrearTerminalDto, EditarTerminalDto } from './dto/terminales.dto.js';
import { TerminalesService } from './terminales.service.js';

@ApiTags('Terminales')
@ApiCookieAuth('vms_access')
@Roles(Rol.ADMINISTRADOR)
@Controller('terminales')
export class TerminalesController {
  constructor(private readonly terminales: TerminalesService) {}

  @Get()
  @ApiOperation({ summary: 'Terminales con su estado y última sincronización (HU-38)' })
  listar() {
    return this.terminales.listar();
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un terminal. El secreto se muestra una sola vez' })
  crear(@Body() dto: CrearTerminalDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.terminales.crear(dto, usuario);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar o desactivar un terminal' })
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarTerminalDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.terminales.editar(id, dto, usuario);
  }

  @Post(':id/secreto')
  @ApiOperation({ summary: 'Regenerar el secreto: el anterior deja de funcionar' })
  regenerarSecreto(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.terminales.regenerarSecreto(id, usuario);
  }

  @Post(':id/sincronizar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Consultar el estado y enviar lo pendiente' })
  sincronizar(@Param('id', ParseUUIDPipe) id: string) {
    return this.terminales.sincronizar(id);
  }
}
