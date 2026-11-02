import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

const PREFIJO_API = 'api/v1';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  // Detrás de Caddy: la IP real alimenta la bitácora y el límite de peticiones
  if (config.get('NODE_ENV', { infer: true }) === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('FRONTEND_URL', { infer: true }),
    credentials: true,
  });
  app.setGlobalPrefix(PREFIJO_API);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VMS · Sistema de Gestión de Visitantes')
        .setDescription('API REST del VMS para una planta textil en Bogotá')
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth('vms_access')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, documento, { customSiteTitle: 'VMS API' });
  }

  const puerto = config.get('PORT', { infer: true });
  await app.listen(puerto);
  logger.log(`API disponible en http://localhost:${puerto}/${PREFIJO_API}`);
  logger.log(`Documentación en http://localhost:${puerto}/api/docs`);
}

await bootstrap();
