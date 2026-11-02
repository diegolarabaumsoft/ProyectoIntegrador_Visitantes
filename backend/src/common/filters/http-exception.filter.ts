import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Formato uniforme de error de la API. */
export interface RespuestaError {
  statusCode: number;
  codigo: string;
  mensaje: string;
  detalles?: unknown;
  ruta: string;
  fecha: string;
}

const CODIGOS_POR_ESTADO: Record<number, string> = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'NO_AUTORIZADO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  410: 'EXPIRADO',
  422: 'REGLA_DE_NEGOCIO',
  423: 'BLOQUEADO',
  429: 'DEMASIADAS_SOLICITUDES',
  500: 'ERROR_INTERNO',
};

/**
 * Convierte cualquier excepción en `{ statusCode, codigo, mensaje, detalles?, ruta, fecha }`.
 * Los errores no controlados se registran y se devuelven sin detalles internos.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let codigo = CODIGOS_POR_ESTADO[statusCode];
    let mensaje = 'Ocurrió un error inesperado';
    let detalles: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      codigo = CODIGOS_POR_ESTADO[statusCode] ?? 'ERROR';
      const cuerpo = exception.getResponse();
      if (typeof cuerpo === 'string') {
        mensaje = cuerpo;
      } else if (cuerpo && typeof cuerpo === 'object') {
        const c = cuerpo as Record<string, unknown>;
        if (typeof c['codigo'] === 'string') codigo = c['codigo'];
        if (typeof c['mensaje'] === 'string') mensaje = c['mensaje'];
        else if (Array.isArray(c['message'])) {
          // class-validator: lista de mensajes de validación
          mensaje = 'Datos de entrada inválidos';
          codigo = 'VALIDACION';
          detalles = c['message'];
        } else if (typeof c['message'] === 'string') mensaje = c['message'];
        if (c['detalles'] !== undefined) detalles = c['detalles'];
      }
    } else {
      this.logger.error(
        `Error no controlado en ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const cuerpo: RespuestaError = {
      statusCode,
      codigo,
      mensaje,
      ...(detalles !== undefined ? { detalles } : {}),
      ruta: request.url,
      fecha: new Date().toISOString(),
    };
    response.status(statusCode).json(cuerpo);
  }
}
