import { apiGet, apiPatch, apiPost } from '@/lib/api';

export interface Presente {
  visitaId: string;
  visitante: { nombreCompleto: string; empresa: string };
  anfitrion: string;
  acompanante: string | null;
  zonaActual: { movimientoId: string; id: string; nombre: string; esSensible: boolean } | null;
  horaIngreso: string;
  tiempoAutorizadoMin: number;
  modoContingencia: boolean;
  alertaEnviada: boolean;
  sinPaso: boolean;
  minutosTranscurridos: number;
  minutosRestantes: number;
  excedido: boolean;
}

export interface ListaPresentes {
  generadoEn: string;
  total: number;
  presentes: Presente[];
}

export const permanenciaApi = {
  presentes: (q?: string) => apiGet<ListaPresentes>('/permanencia/presentes', { q }),
  registrarMovimiento: (visitaId: string, zonaId: string) => apiPost<{ id: string }>(`/visitas/${visitaId}/movimientos`, { zonaId }),
  registrarSalidaZona: (visitaId: string, movimientoId: string) => apiPatch<{ id: string }>(`/visitas/${visitaId}/movimientos/${movimientoId}/salida`),
  asignarAcompanante: (visitaId: string, acompananteId: string) => apiPatch<{ visitaId: string }>(`/visitas/${visitaId}/acompanante`, { acompananteId }),
};

export const clavesPermanencia = {
  todas: ['permanencia'] as const,
  presentes: (q?: string) => ['permanencia', 'presentes', q ?? ''] as const,
};
