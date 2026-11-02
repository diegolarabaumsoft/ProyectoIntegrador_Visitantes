import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActividadInterceptor } from './actividad.interceptor.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_INTERCEPTOR, useClass: ActividadInterceptor }],
  exports: [AuthService],
})
export class AuthModule {}
