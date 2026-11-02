import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

@ApiTags('Salud')
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Estado de la API y de la conexión a la base de datos' })
  async estado() {
    let baseDatos: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      baseDatos = 'error';
    }
    return { estado: baseDatos === 'ok' ? 'ok' : 'degradado', baseDatos, fecha: new Date().toISOString() };
  }
}
