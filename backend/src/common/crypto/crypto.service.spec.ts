import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service.js';

const crear = (clave = randomBytes(32).toString('base64'), pepper = 'pepper-de-prueba') =>
  new CryptoService({ get: (k: string) => (k === 'CRYPTO_KEY' ? clave : pepper) } as never);

describe('CryptoService', () => {
  it('cifra con IV distinto y descifra el original', () => {
    const c = crear();
    const a = c.cifrar('Laura Comercial');
    expect(a).not.toContain('Laura');
    expect(c.cifrar('Laura Comercial')).not.toBe(a);
    expect(c.descifrar(a)).toBe('Laura Comercial');
  });

  it('rechaza un dato alterado o de formato desconocido', () => {
    const c = crear();
    const a = c.cifrar('dato');
    const alterado = `${a.slice(0, -3)}AAA`;
    expect(() => c.descifrar(alterado)).toThrow();
    expect(() => c.descifrar('texto-plano')).toThrow('Formato');
  });

  it('el hash es determinista, normaliza y depende del pepper', () => {
    const clave = randomBytes(32).toString('base64');
    const c = crear(clave);
    expect(c.hashDocumento('1.020.304-050')).toBe(c.hashDocumento('1020304050'));
    expect(c.hashCorreo('ANA@X.COM')).toBe(c.hashCorreo('ana@x.com'));
    expect(crear(clave, 'otro').hashDocumento('1020304050')).not.toBe(c.hashDocumento('1020304050'));
  });
});
