/**
 * Interfaz de los terminales biométricos (segregación de interfaces, sección 7.4 del
 * documento base). Ninguna implementación debe guardar o registrar las plantillas.
 */
export interface DestinoTerminal {
  id: string;
  ip: string;
}

export interface CargaPlantilla {
  visitaId: string;
  plantillas: { dedo: string; formato: string; plantilla: string }[];
  vigenteDesde: Date;
  vigenteHasta: Date;
}

export type ResultadoTerminal = { ok: true } | { ok: false; timeout: boolean; error?: string };

export interface ITerminalBiometrico {
  cargar(terminal: DestinoTerminal, carga: CargaPlantilla, timeoutMs: number): Promise<ResultadoTerminal>;
  revocar(terminal: DestinoTerminal, visitaId: string, timeoutMs: number): Promise<ResultadoTerminal>;
  /** true si el terminal responde. */
  sondear(terminal: DestinoTerminal, timeoutMs: number): Promise<boolean>;
  /** Solo disponible en el simulador. */
  readonly simulado: boolean;
}

export const TERMINAL_BIOMETRICO = Symbol('TERMINAL_BIOMETRICO');

/**
 * Simulador para desarrollo: registra qué visitas tiene cargadas cada terminal, sin
 * conservar las plantillas, y permite dejar un terminal fuera de línea.
 */
export class TerminalSimulado implements ITerminalBiometrico {
  readonly simulado = true;
  private readonly fueraDeLinea = new Set<string>();
  private readonly cargadas = new Map<string, Set<string>>();

  configurar(terminalId: string, enLinea: boolean): void {
    if (enLinea) this.fueraDeLinea.delete(terminalId);
    else this.fueraDeLinea.add(terminalId);
  }

  sondear(terminal: DestinoTerminal): Promise<boolean> {
    return Promise.resolve(!this.fueraDeLinea.has(terminal.id));
  }

  estaEnLinea(terminalId: string): boolean {
    return !this.fueraDeLinea.has(terminalId);
  }

  visitasCargadas(terminalId: string): string[] {
    return [...(this.cargadas.get(terminalId) ?? [])];
  }

  cargar(terminal: DestinoTerminal, carga: CargaPlantilla): Promise<ResultadoTerminal> {
    if (this.fueraDeLinea.has(terminal.id)) return Promise.resolve({ ok: false, timeout: true, error: 'Terminal fuera de línea (simulado)' });
    if (carga.plantillas.length === 0) return Promise.resolve({ ok: false, timeout: false, error: 'Sin plantillas' });
    this.cargadas.set(terminal.id, new Set([...this.visitasCargadas(terminal.id), carga.visitaId]));
    return Promise.resolve({ ok: true });
  }

  revocar(terminal: DestinoTerminal, visitaId: string): Promise<ResultadoTerminal> {
    if (this.fueraDeLinea.has(terminal.id)) return Promise.resolve({ ok: false, timeout: true, error: 'Terminal fuera de línea (simulado)' });
    this.cargadas.get(terminal.id)?.delete(visitaId);
    return Promise.resolve({ ok: true });
  }
}

/**
 * Terminal real por HTTP. El contrato es provisional: debe ajustarse al SDK o a la
 * API del fabricante que se elija, y no se ha probado con un equipo físico.
 */
export class TerminalHttp implements ITerminalBiometrico {
  readonly simulado = false;

  cargar(terminal: DestinoTerminal, carga: CargaPlantilla, timeoutMs: number): Promise<ResultadoTerminal> {
    return this.enviar(`http://${terminal.ip}/autorizaciones`, 'POST', timeoutMs, carga);
  }

  revocar(terminal: DestinoTerminal, visitaId: string, timeoutMs: number): Promise<ResultadoTerminal> {
    return this.enviar(`http://${terminal.ip}/autorizaciones/${visitaId}`, 'DELETE', timeoutMs);
  }

  async sondear(terminal: DestinoTerminal, timeoutMs: number): Promise<boolean> {
    return (await this.enviar(`http://${terminal.ip}/estado`, 'GET', timeoutMs)).ok;
  }

  private async enviar(url: string, method: string, timeoutMs: number, cuerpo?: unknown): Promise<ResultadoTerminal> {
    try {
      const respuesta = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return respuesta.ok ? { ok: true } : { ok: false, timeout: false, error: `Terminal respondió HTTP ${respuesta.status}` };
    } catch (error) {
      const nombre = (error as { name?: string }).name;
      return { ok: false, timeout: nombre === 'TimeoutError' || nombre === 'AbortError', error: 'Terminal sin respuesta' };
    }
  }
}
