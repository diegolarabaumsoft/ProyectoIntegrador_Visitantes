import { ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Rol } from '../../generated/prisma/enums.js';
import { PrivacidadService, VisitaActivaError } from './privacidad.service.js';

/**
 * Anonimización y retención (CL-06). ANT-11 añade la exportación anonimizada y
 * ANT-12 las solicitudes de los titulares en este mismo módulo.
 */
@ApiTags('Privacidad')
@ApiCookieAuth('vms_access')
@Controller('privacidad')
export class PrivacidadController {
  constructor(private readonly privacidad: PrivacidadService) {}

  @Get('anonimizacion/estado')
  @Roles(Rol.DPO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Período de retención vigente, candidatos a anonimizar y última ejecución (RNF-03)' })
  estado() {
    return this.privacidad.estadoRetencion();
  }

  @Post('anonimizacion/ejecutar')
  @HttpCode(200)
  @Roles(Rol.DPO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Ejecuta ahora la anonimización por retención, sin esperar al cron diario' })
  ejecutar() {
    return this.privacidad.ejecutarRetencion();
  }

  @Post('visitantes/:visitanteId/anonimizar')
  @HttpCode(200)
  @Roles(Rol.DPO)
  @ApiOperation({ summary: 'Anonimiza un visitante a petición del titular (HU-36); irreversible' })
  async anonimizar(@Param('visitanteId', ParseUUIDPipe) visitanteId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    try {
      return await this.privacidad.anonimizarVisitante(visitanteId, usuario, 'SOLICITUD_TITULAR');
    } catch (error) {
      if (error instanceof VisitaActivaError) {
        throw new ConflictException({ codigo: 'VISITA_ACTIVA', mensaje: error.message });
      }
      throw error;
    }
  }
}
