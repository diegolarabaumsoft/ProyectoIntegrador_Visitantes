import { ConflictException, Injectable } from '@nestjs/common';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Visitante } from '../../generated/prisma/client.js';
import type { TipoDocumento } from '../../generated/prisma/enums.js';

/** Visitante con los datos personales en claro (solo para respuestas de la API). */
export interface VisitantePublico {
  id: string;
  nombreCompleto: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  empresa: string;
  correo: string;
  telefono: string | null;
  anonimizado: boolean;
}

export interface DatosVisitante {
  nombreCompleto: string;
  correo: string;
  empresa: string;
  tipoDocumento?: TipoDocumento;
  numeroDocumento?: string;
  telefono?: string;
}

/**
 * Acceso a visitantes con cifrado de datos personales (RNF-02).
 * El resto de módulos nunca lee las columnas cifradas directamente.
 */
@Injectable()
export class VisitantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  descifrar(v: Visitante): VisitantePublico {
    if (v.anonimizado) {
      return {
        id: v.id,
        nombreCompleto: 'Visitante anonimizado',
        tipoDocumento: v.tipoDocumento,
        numeroDocumento: '—',
        empresa: v.empresa,
        correo: '—',
        telefono: null,
        anonimizado: true,
      };
    }
    return {
      id: v.id,
      nombreCompleto: this.crypto.descifrar(v.nombreCompleto),
      tipoDocumento: v.tipoDocumento,
      numeroDocumento: this.crypto.descifrar(v.numeroDocumento),
      empresa: v.empresa,
      correo: this.crypto.descifrar(v.correo),
      telefono: v.telefono ? this.crypto.descifrar(v.telefono) : null,
      anonimizado: false,
    };
  }

  /** Datos mínimos para listados (sin documento ni teléfono). */
  resumen(v: Visitante): { id: string; nombreCompleto: string; empresa: string; correo: string } {
    const p = this.descifrar(v);
    return { id: p.id, nombreCompleto: p.nombreCompleto, empresa: p.empresa, correo: p.correo };
  }

  async buscarPorCorreo(correo: string): Promise<Visitante | null> {
    return this.prisma.visitante.findFirst({ where: { correoHash: this.crypto.hashCorreo(correo), anonimizado: false } });
  }

  async buscarPorDocumento(numeroDocumento: string): Promise<Visitante | null> {
    return this.prisma.visitante.findFirst({
      where: { numeroDocumentoHash: this.crypto.hashDocumento(numeroDocumento), anonimizado: false },
    });
  }

  /**
   * Reutiliza el visitante si ya existe por correo (visitante recurrente, HU-28)
   * y actualiza los datos que lleguen; si no existe, lo crea.
   */
  async crearOActualizar(datos: DatosVisitante): Promise<Visitante> {
    const existente = await this.buscarPorCorreo(datos.correo);
    if (existente) {
      return this.prisma.visitante.update({ where: { id: existente.id }, data: this.cifrarDatos(datos) });
    }
    const documento = datos.numeroDocumento?.trim() ?? '';
    return this.prisma.visitante.create({
      data: {
        nombreCompleto: this.crypto.cifrar(datos.nombreCompleto.trim()),
        correo: this.crypto.cifrar(datos.correo.trim().toLowerCase()),
        correoHash: this.crypto.hashCorreo(datos.correo),
        empresa: datos.empresa.trim(),
        tipoDocumento: datos.tipoDocumento ?? 'CC',
        numeroDocumento: this.crypto.cifrar(documento),
        numeroDocumentoHash: documento ? this.crypto.hashDocumento(documento) : '',
        telefono: datos.telefono ? this.crypto.cifrar(datos.telefono.trim()) : null,
      },
    });
  }

  /**
   * Registro exprés (HU-11): el correo es opcional, por lo que el visitante
   * recurrente se reconoce por documento. Un correo ajeno se rechaza: adoptar a
   * ese visitante le cambiaría la identidad y heredaría su inducción vigente.
   */
  async crearOActualizarExpres(datos: Omit<DatosVisitante, 'correo'> & { correo?: string; numeroDocumento: string }): Promise<Visitante> {
    const porDocumento = await this.buscarPorDocumento(datos.numeroDocumento);
    const porCorreo = datos.correo ? await this.buscarPorCorreo(datos.correo) : null;
    // Un visitante invitado que aún no diligenció su documento sí puede completarse aquí
    if (porCorreo && porCorreo.id !== porDocumento?.id && (porDocumento || porCorreo.numeroDocumentoHash)) {
      throw new ConflictException({ codigo: 'CORREO_DE_OTRO_VISITANTE', mensaje: 'Ese correo pertenece a otro visitante. Verifique el dato o déjelo vacío' });
    }
    const existente = porDocumento ?? porCorreo;
    if (existente) return this.actualizar(existente.id, datos);
    const correo = datos.correo?.trim().toLowerCase() ?? '';
    return this.prisma.visitante.create({
      data: {
        nombreCompleto: this.crypto.cifrar(datos.nombreCompleto.trim()),
        correo: this.crypto.cifrar(correo),
        correoHash: correo ? this.crypto.hashCorreo(correo) : '',
        empresa: datos.empresa.trim(),
        tipoDocumento: datos.tipoDocumento ?? 'CC',
        numeroDocumento: this.crypto.cifrar(datos.numeroDocumento.trim()),
        numeroDocumentoHash: this.crypto.hashDocumento(datos.numeroDocumento),
      },
    });
  }

  async actualizar(id: string, datos: Partial<DatosVisitante>): Promise<Visitante> {
    return this.prisma.visitante.update({ where: { id }, data: this.cifrarDatos(datos) });
  }

  private cifrarDatos(datos: Partial<DatosVisitante>) {
    return {
      ...(datos.nombreCompleto !== undefined ? { nombreCompleto: this.crypto.cifrar(datos.nombreCompleto.trim()) } : {}),
      ...(datos.correo !== undefined
        ? { correo: this.crypto.cifrar(datos.correo.trim().toLowerCase()), correoHash: this.crypto.hashCorreo(datos.correo) }
        : {}),
      ...(datos.empresa !== undefined ? { empresa: datos.empresa.trim() } : {}),
      ...(datos.tipoDocumento !== undefined ? { tipoDocumento: datos.tipoDocumento } : {}),
      ...(datos.numeroDocumento !== undefined && datos.numeroDocumento !== ''
        ? {
            numeroDocumento: this.crypto.cifrar(datos.numeroDocumento.trim()),
            numeroDocumentoHash: this.crypto.hashDocumento(datos.numeroDocumento),
          }
        : {}),
      ...(datos.telefono !== undefined ? { telefono: datos.telefono ? this.crypto.cifrar(datos.telefono.trim()) : null } : {}),
    };
  }
}
