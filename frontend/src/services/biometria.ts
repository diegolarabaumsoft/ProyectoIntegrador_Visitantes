import { apiGet, apiPost } from '@/lib/api';
import type { Dedo, ResultadoCaptura } from '@/lib/huellero';
import type { EstadoVisita } from '@/types/api';

export interface EstadoBiometria {
  autorizaBiometria: boolean;
  estadoVisita: EstadoVisita;
  dedosRequeridos: number;
  muestrasPorDedo: number;
  calidadMinima: number;
  plantillas: { dedo: Dedo; calidad: number; fechaEnrolamiento: string; venceEn: string }[];
}

export interface MuestraHuella {
  dedo: Dedo;
  formato: string;
  plantilla: string;
  calidad: number;
  pruebaVida: boolean;
}

export type ResultadoIdentificacion =
  | { resultado: 'COINCIDE'; visitaId: string; intentosMaximos: number }
  | { resultado: 'NO_COINCIDE' | 'CALIDAD_BAJA' | 'PRUEBA_VIDA_FALLIDA'; intentosMaximos: number };

export const biometriaApi = {
  identificar: (captura: ResultadoCaptura) =>
    apiPost<ResultadoIdentificacion>(
      '/biometria/identificacion',
      captura.ok ? { formato: captura.formato, plantilla: captura.plantilla, calidad: captura.calidad, pruebaVida: captura.pruebaVida } : { motivo: captura.motivo },
    ),
  estado: (visitaId: string) => apiGet<EstadoBiometria>(`/biometria/visitas/${visitaId}`),
  enrolar: (visitaId: string, muestras: MuestraHuella[]) =>
    apiPost<{ dedos: Dedo[]; venceEn: string }>(`/biometria/visitas/${visitaId}/enrolamiento`, { identidadConfirmada: true, muestras }),
};

export const clavesBiometria = {
  todas: ['biometria'] as const,
  estado: (visitaId: string) => ['biometria', visitaId] as const,
  huellero: ['biometria', 'huellero'] as const,
};
