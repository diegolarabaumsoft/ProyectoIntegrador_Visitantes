import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol, TipoSolicitudDatos } from '../../generated/prisma/enums.js';
import { SolicitudesService } from './solicitudes.service.js';

export class RegistrarSolicitudDto {
  @ApiProperty({ enum: TipoSolicitudDatos })
  @IsEnum(TipoSolicitudDatos)
  tipo!: TipoSolicitudDatos;

  @ApiProperty()
  @Matches(/^[A-Za-z0-9.\-\s]{5,30}$/, { message: 'El número de documento no es válido' })
  numeroDocumento!: string;
}

export class AtenderSolicitudDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  respuesta!: string;
}

export class RetencionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(36500)
  retencionDias!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  politicaVersion!: string;
}

@ApiTags('Privacidad')
@ApiCookieAuth('vms_access')
@Controller('privacidad')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Get('solicitudes')
  @Roles(Rol.DPO)
  @ApiOperation({ summary: 'Solicitudes de los titulares (HU-36)' })
  listar() {
    return this.solicitudes.listar();
  }

  @Post('solicitudes')
  @Roles(Rol.DPO)
  @ApiOperation({ summary: 'Registra una solicitud; plazo de 15 días hábiles' })
  registrar(@Body() dto: RegistrarSolicitudDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.solicitudes.registrar(dto.tipo, dto.numeroDocumento, usuario, ip);
  }

  @Get('solicitudes/:id/datos')
  @Roles(Rol.DPO)
  @ApiOperation({ summary: 'Datos personales del titular para responder la solicitud; el acceso queda registrado' })
  datos(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.solicitudes.datosTitular(id, usuario, ip);
  }

  @Patch('solicitudes/:id/atender')
  @Roles(Rol.DPO)
  @ApiOperation({ summary: 'Atiende la solicitud; eliminación y anonimización son irreversibles' })
  atender(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtenderSolicitudDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.solicitudes.atender(id, dto.respuesta, usuario, ip);
  }

  @Get('retencion')
  @Roles(Rol.DPO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Días de retención, versión de la política y estado de la tarea' })
  retencion() {
    return this.solicitudes.retencion();
  }

  @Put('retencion')
  @Roles(Rol.DPO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Modifica la política de retención' })
  guardar(@Body() dto: RetencionDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    return this.solicitudes.guardarRetencion(dto.retencionDias, dto.politicaVersion, usuario, ip);
  }
}
