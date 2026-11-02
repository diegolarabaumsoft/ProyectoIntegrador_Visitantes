import {
  Body,
  Controller,
  Get,
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
import { Rol } from '../../generated/prisma/enums.js';
import { ActualizarZonaDto } from './dto/actualizar-zona.dto.js';
import { CrearZonaDto } from './dto/crear-zona.dto.js';
import { ListarZonasDto } from './dto/listar-zonas.dto.js';
import { ZonasService } from './zonas.service.js';

@ApiTags('Zonas')
@ApiCookieAuth('vms_access')
@Controller('zonas')
export class ZonasController {
  constructor(private readonly zonas: ZonasService) {}

  @Get()
  @Roles(
    Rol.ADMINISTRADOR,
    Rol.JEFE_SEGURIDAD,
    Rol.RECEPCION_SEGURIDAD,
    Rol.ANFITRION,
    Rol.DPO,
  )
  @ApiOperation({ summary: 'Listar zonas de la planta (todos los roles internos)' })
  listar(@Query() dto: ListarZonasDto) {
    return this.zonas.listar(dto);
  }

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear nueva zona de la planta' })
  crear(
    @Body() dto: CrearZonaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.zonas.crear(dto, usuario, ip);
  }

  @Patch(':id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Actualizar configuración de una zona' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarZonaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.zonas.actualizar(id, dto, usuario, ip);
  }

  @Patch(':id/desactivar')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Desactivar una zona' })
  desactivar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.zonas.desactivar(id, usuario, ip);
  }
}
