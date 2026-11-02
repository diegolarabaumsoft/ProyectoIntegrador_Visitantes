import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { COOKIE_ACCESO, COOKIE_REFRESCO, COOKIE_ROL, type UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator.js';
import type { Env } from '../../config/env.js';
import { AuthService, type ResultadoSesion } from './auth.service.js';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto.js';
import { LoginDto } from './dto/login.dto.js';

const RUTA_COOKIE_REFRESCO = '/api/v1/auth';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  private readonly segura: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.segura = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicio de sesión de usuario interno (HU-25)' })
  @ApiResponse({ status: 200, description: 'Sesión creada; tokens enviados en cookies httpOnly' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o cuenta bloqueada' })
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const sesion = await this.auth.login(dto.correo, dto.contrasena, ip);
    this.escribirCookies(res, sesion);
    return { usuario: sesion.usuario };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiCookieAuth(COOKIE_REFRESCO)
  @ApiOperation({ summary: 'Renueva el token de acceso si la sesión sigue activa' })
  async refrescar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const sesion = await this.auth.refrescar(this.leerCookie(req, COOKIE_REFRESCO));
      this.escribirCookies(res, sesion);
      return { usuario: sesion.usuario };
    } catch (error) {
      this.borrarCookies(res);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Cierra la sesión y revoca el refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @UsuarioActual() usuario?: UsuarioAutenticado) {
    await this.auth.cerrarSesion(this.leerCookie(req, COOKIE_REFRESCO), usuario);
    this.borrarCookies(res);
  }

  @Post('cambiar-contrasena')
  @HttpCode(204)
  @ApiCookieAuth(COOKIE_ACCESO)
  @ApiOperation({ summary: 'Cambia la contraseña propia y cierra las demás sesiones' })
  async cambiar(@Body() dto: CambiarContrasenaDto, @UsuarioActual() usuario: UsuarioAutenticado, @Req() req: Request, @Ip() ip: string): Promise<void> {
    await this.auth.cambiarContrasena(usuario, dto.actual, dto.nueva, this.leerCookie(req, COOKIE_REFRESCO), ip);
  }

  @Get('me')
  @ApiCookieAuth(COOKIE_ACCESO)
  @ApiOperation({ summary: 'Usuario autenticado y su rol' })
  me(@UsuarioActual() usuario: UsuarioAutenticado) {
    return usuario;
  }

  private leerCookie(req: Request, nombre: string): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[nombre];
  }

  private escribirCookies(res: Response, sesion: ResultadoSesion): void {
    const base = { httpOnly: true, secure: this.segura, sameSite: 'lax' as const };
    res.cookie(COOKIE_ACCESO, sesion.accessToken, { ...base, path: '/', maxAge: sesion.accessTtlMs });
    res.cookie(COOKIE_REFRESCO, sesion.refreshToken, { ...base, path: RUTA_COOKIE_REFRESCO, maxAge: sesion.refreshTtlMs });
    // Legible por el frontend solo para redirecciones por rol; la API nunca la usa
    res.cookie(COOKIE_ROL, sesion.usuario.rol, { httpOnly: false, secure: this.segura, sameSite: 'lax', path: '/', maxAge: sesion.refreshTtlMs });
  }

  private borrarCookies(res: Response): void {
    res.clearCookie(COOKIE_ACCESO, { path: '/' });
    res.clearCookie(COOKIE_REFRESCO, { path: RUTA_COOKIE_REFRESCO });
    res.clearCookie(COOKIE_ROL, { path: '/' });
  }
}
