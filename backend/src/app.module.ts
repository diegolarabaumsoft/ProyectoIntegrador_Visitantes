import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthCoreModule } from './common/auth/auth-core.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ContrasenaTemporalGuard } from './common/guards/contrasena-temporal.guard.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { validarEnv } from './config/env.js';
import { PrismaModule } from './database/prisma.module.js';
import { EventosModule } from './eventos/eventos.module.js';
import { AcsModule } from './integraciones/acs/acs.module.js';
import { CorreoModule } from './integraciones/correo/correo.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BitacoraModule } from './modules/bitacora/bitacora.module.js';
import { BiometriaModule } from './modules/biometria/biometria.module.js';
import { CheckInOutModule } from './modules/check-in-out/check-in-out.module.js';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module.js';
import { CredencialesModule } from './modules/credenciales/credenciales.module.js';
import { InvitacionesModule } from './modules/invitaciones/invitaciones.module.js';
import { MonitoreoPermanenciaModule } from './modules/monitoreo-permanencia/monitoreo-permanencia.module.js';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module.js';
import { PermanenciaModule } from './modules/permanencia/permanencia.module.js';
import { PreRegistroModule } from './modules/pre-registro/pre-registro.module.js';
import { PrivacidadModule } from './modules/privacidad/privacidad.module.js';
import { RestriccionesModule } from './modules/restricciones/restricciones.module.js';
import { ReportesKpiModule } from './modules/reportes-kpi/reportes-kpi.module.js';
import { SaludModule } from './modules/salud/salud.module.js';
import { SeguridadIndustrialModule } from './modules/seguridad-industrial/seguridad-industrial.module.js';
import { UsuariosModule } from './modules/usuarios/usuarios.module.js';
import { VisitasModule } from './modules/visitas/visitas.module.js';
import { VisitantesModule } from './modules/visitantes/visitantes.module.js';
import { ZonasModule } from './modules/zonas/zonas.module.js';

/**
 * Monolito modular (sección 7.1 del plan): cada dominio es un módulo Nest.
 * Los módulos transversales (config, datos, cifrado, eventos, auth) son
 * globales; los de negocio se registran aquí a medida que avanzan los sprints.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnv, cache: true }),
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    CryptoModule,
    EventosModule,
    AuthCoreModule,
    CorreoModule,
    VisitantesModule,
    ConfiguracionModule,
    AcsModule,
    // Módulos de negocio
    AuthModule,
    BitacoraModule,
    NotificacionesModule,
    InvitacionesModule,
    CredencialesModule,
    SeguridadIndustrialModule,
    PreRegistroModule,
    RestriccionesModule,
    CheckInOutModule,
    MonitoreoPermanenciaModule,
    BiometriaModule,
    PermanenciaModule,
    PrivacidadModule,
    UsuariosModule,
    VisitasModule,
    ReportesKpiModule,
    SaludModule,
    ZonasModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ContrasenaTemporalGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
