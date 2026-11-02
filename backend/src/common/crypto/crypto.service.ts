import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.js';

const ALGORITMO = 'aes-256-gcm';
const PREFIJO = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Cifrado de datos personales en reposo (RNF-02).
 *
 * - `cifrar` / `descifrar`: AES-256-GCM con IV aleatorio por valor. El texto
 *   cifrado se guarda como "v1:<base64(iv|tag|cifrado)>", lo que permite
 *   rotar el esquema en el futuro.
 * - `hash`: SHA-256 con pepper sobre el valor normalizado. Permite buscar e
 *   indexar (documento, correo) y cruzar con la lista de restricción sin
 *   almacenar el dato en claro.
 */
@Injectable()
export class CryptoService {
  private readonly clave: Buffer;
  private readonly pepper: string;

  constructor(config: ConfigService<Env, true>) {
    this.clave = Buffer.from(config.get('CRYPTO_KEY', { infer: true }), 'base64');
    this.pepper = config.get('CRYPTO_PEPPER', { infer: true });
  }

  cifrar(textoPlano: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITMO, this.clave, iv);
    const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIJO}:${Buffer.concat([iv, tag, cifrado]).toString('base64')}`;
  }

  descifrar(textoCifrado: string): string {
    const [prefijo, cuerpo] = textoCifrado.split(':');
    if (prefijo !== PREFIJO || !cuerpo) {
      throw new Error('Formato de dato cifrado no reconocido');
    }
    const buffer = Buffer.from(cuerpo, 'base64');
    const iv = buffer.subarray(0, IV_BYTES);
    const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const cifrado = buffer.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITMO, this.clave, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
  }

  /** Hash determinista para búsquedas. Normaliza antes de hashear. */
  hash(valor: string): string {
    return createHash('sha256')
      .update(`${this.pepper}:${CryptoService.normalizar(valor)}`)
      .digest('hex');
  }

  hashDocumento(numeroDocumento: string): string {
    return this.hash(numeroDocumento.replace(/[.\s-]/g, ''));
  }

  hashCorreo(correo: string): string {
    return this.hash(correo.toLowerCase());
  }

  /** Token aleatorio seguro para enlaces de pre-registro y refresh tokens. */
  tokenAleatorio(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Hash sin pepper de un token aleatorio (el token ya es impredecible). */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private static normalizar(valor: string): string {
    return valor.trim().toLowerCase();
  }
}
