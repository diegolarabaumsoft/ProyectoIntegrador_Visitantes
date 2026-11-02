import { Body, Controller, ForbiddenException, Get, Ip, NotFoundException, Param, Put, UnprocessableEntityException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';
import { type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import { Eventos } from '../../eventos/eventos.js';
import { PublicadorEventos } from '../../eventos/publicador-eventos.service.js';
import { ElementoEpp, Rol, TipoEvento } from '../../generated/prisma/enums.js';
import { ConfiguracionService, type ClaveConfiguracion } from './configuracion.service.js';

export class ActualizarParametroDto {
  @ApiProperty({ description: 'Entero positivo, texto o arreglo de elementos de EPP, según la clave' })
  @IsDefined()
  valor!: unknown;
}

const NUMERICAS: ClaveConfiguracion[] = [
  'enlace_preregistro_horas',
  'qr_margen_antes_min',
  'qr_margen_despues_min',
  'permanencia_default_min',
  'acs_timeout_ms',
  'induccion_vigencia_meses',
  'retencion_dias',
  'login_max_intentos',
  'login_bloqueo_min',
  'sesion_inactividad_min',
  'biometria_intentos',
  'biometria_retencion_meses',
  'terminal_fuera_linea_min',
];
const DEL_DPO: ClaveConfiguracion[] = ['retencion_dias', 'politica_version'];

function valido(clave: ClaveConfiguracion, valor: unknown): boolean {
  if (clave === 'induccion_puntaje_minimo') return Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) <= 100;
  if (clave === 'biometria_calidad_minima') return Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) <= 100;
  // El enrolamiento acepta hasta 20 muestras en total, para dos dedos
  if (clave === 'biometria_muestras_por_dedo') return Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) <= 10;
  if (NUMERICAS.includes(clave)) return Number.isInteger(valor) && (valor as number) > 0;
  if (clave === 'politica_version') return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= 40;
  if (clave === 'epp_obligatorio') return Array.isArray(valor) && valor.every((v) => typeof v === 'string' && v in ElementoEpp);
  return false;
}

@ApiTags('Configuración')
@ApiCookieAuth('vms_access')
@Controller('configuracion')
export class ConfiguracionController {
  constructor(
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: PublicadorEventos,
  ) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.DPO)
  @ApiOperation({ summary: 'Parámetros editables' })
  todas() {
    return this.configuracion.todas();
  }

  @Put(':clave')
  @Roles(Rol.ADMINISTRADOR, Rol.DPO)
  @ApiOperation({ summary: 'Modifica un parámetro; el DPO solo retención y versión de la política' })
  async actualizar(@Param('clave') clave: string, @Body() dto: ActualizarParametroDto, @UsuarioActual() usuario: UsuarioAutenticado, @Ip() ip: string) {
    const parametro = clave as ClaveConfiguracion;
    const actual = (await this.configuracion.todas()).find((c) => c.clave === clave);
    if (!actual) throw new NotFoundException({ codigo: 'PARAMETRO_NO_ENCONTRADO', mensaje: 'El parámetro no existe' });
    if (usuario.rol === Rol.DPO && !DEL_DPO.includes(parametro)) throw new ForbiddenException({ codigo: 'ROL_NO_AUTORIZADO', mensaje: 'Su rol solo puede modificar la retención y la versión de la política' });
    if (!valido(parametro, dto.valor)) throw new UnprocessableEntityException({ codigo: 'VALOR_INVALIDO', mensaje: 'El valor no es válido para este parámetro' });
    await this.configuracion.actualizar(parametro, dto.valor);
    this.eventos.publicar(Eventos.CONFIGURACION_MODIFICADA, {
      tipo: TipoEvento.CONFIGURACION_MODIFICADA,
      actor: usuario.nombre,
      actorId: usuario.id,
      entidad: 'configuracion',
      entidadId: clave,
      resultado: `parámetro ${clave} modificado`,
      detalle: { clave, anterior: actual.valor, nuevo: dto.valor },
      ip,
    });
    return { clave, valor: dto.valor };
  }
}
