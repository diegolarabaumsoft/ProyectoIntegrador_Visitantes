import { apiGet, apiPatch, apiPost } from '@/lib/api';

export type TipoTerminal = 'ENTRADA' | 'SALIDA' | 'ZONA';

export const NOMBRE_TIPO_TERMINAL: Record<TipoTerminal, string> = { ENTRADA: 'Entrada', SALIDA: 'Salida', ZONA: 'Lector de zona' };

export interface Terminal {
  id: string;
  nombre: string;
  tipo: TipoTerminal;
  ip: string;
  enLinea: boolean;
  activo: boolean;
  ultimaSincronizacion: string | null;
  zona: { id: string; nombre: string } | null;
  tieneSecreto: boolean;
  pendientes: number;
  simuladoEnLinea: boolean | null;
}

export interface ListaTerminales {
  simulado: boolean;
  terminales: Terminal[];
}

export interface DatosTerminal {
  nombre: string;
  tipo: TipoTerminal;
  ip: string;
  zonaId?: string;
}

export const terminalesApi = {
  listar: () => apiGet<ListaTerminales>('/terminales'),
  crear: (datos: DatosTerminal) => apiPost<{ id: string; secreto: string }>('/terminales', datos),
  editar: (id: string, datos: Partial<DatosTerminal> & { activo?: boolean }) => apiPatch<{ id: string }>(`/terminales/${id}`, datos),
  regenerarSecreto: (id: string) => apiPost<{ id: string; secreto: string }>(`/terminales/${id}/secreto`),
  sincronizar: (id: string) => apiPost<ListaTerminales>(`/terminales/${id}/sincronizar`),
  simularPaso: (id: string, visitaId: string) => apiPost<Record<string, unknown>>(`/terminales/${id}/simular-paso`, { visitaId }),
  configurarSimulado: (id: string, enLinea: boolean) => apiPatch<{ enLinea: boolean }>(`/terminales/${id}/simulado`, { enLinea }),
};

export const clavesTerminales = {
  todas: ['terminales'] as const,
};
