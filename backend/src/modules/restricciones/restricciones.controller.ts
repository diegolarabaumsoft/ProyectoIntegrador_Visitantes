import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';
import { Rol } from '../../generated/prisma/enums.js';
import { ActualizarRestriccionDto } from './dto/actualizar-restriccion.dto.js';
import { CrearRestriccionDto } from './dto/crear-restriccion.dto.js';
import { ListarRestriccionesDto } from './dto/listar-restricciones.dto.js';
import { RestriccionesService } from './restricciones.service.js';

@ApiTags('Restricciones')
@ApiCookieAuth('vms_access')
@Controller('restricciones')
export class RestriccionesController {
  constructor(private readonly restricciones: RestriccionesService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD, Rol.RECEPCION_SEGURIDAD)
  @ApiOperation({
    summary: 'Listar personas restringidas (documento completo para admin/seguridad, enmascarado para recepción)',
  })
  listar(@Query() dto: ListarRestriccionesDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.restricciones.listar(dto, usuario.rol);
  }

  @Post()
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Agregar persona a la lista de restricción' })
  crear(
    @Body() dto: CrearRestriccionDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.restricciones.crear(dto, usuario, ip);
  }

  @Patch(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Actualizar nombre de referencia o motivo de una restricción' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarRestriccionDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.restricciones.actualizar(id, dto, usuario, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Rol.ADMINISTRADOR, Rol.JEFE_SEGURIDAD)
  @ApiOperation({ summary: 'Baja lógica de una restricción' })
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.restricciones.eliminar(id, usuario, ip);
  }

  @Get(':id/historial')
  @Roles(Rol.ADMINISTRADOR, Rol.DPO)
  @ApiOperation({ summary: 'Historial de auditoría de la restricción desde la bitácora' })
  historial(@Param('id', ParseUUIDPipe) id: string, @Query() paginacion: PaginacionDto) {
    return this.restricciones.historial(id, paginacion);
  }
}
