import { api, apiGet, apiPost } from '@/lib/api';
import type { EstadoVisita, TipoDocumento } from '@/types/api';

export type PasoPreRegistro = 'DATOS' | 'CONSENTIMIENTO' | 'INDUCCION' | 'CREDENCIAL' | 'HUELLA';

export interface EstadoPreRegistro {
  paso: PasoPreRegistro;
  visita: {
    id: string;
    estado: EstadoVisita;
    fechaProgramada: string;
    motivo: string;
    tiempoAutorizadoMin: number;
    vencimientoEnlace: string | null;
  };
  anfitrion: { nombre: string; area: string | null };
  visitante: {
    nombreCompleto: string;
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
    empresa: string;
    correo: string;
    telefono: string | null;
  };
  esRecurrente: boolean;
  consentimiento: { fechaHoraAceptacion: string; versionPolitica: string; autorizaBiometria: boolean } | null;
  politicaVersion: string;
  induccion: { vigente: true; puntaje: number; venceEn: string } | { vigente: false };
  credencial: { venceEn: string } | null;
  huellaEnrolada: boolean;
}

export interface DatosPreRegistro {
  nombreCompleto: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  empresa: string;
  correo: string;
  telefono?: string;
}

export interface PreguntaInduccion {
  id: string;
  orden: number;
  enunciado: string;
  opciones: string[];
}

export type InduccionParaToken =
  | { vigente: true; puntaje: number; venceEn: string; puntajeMinimo: number; preguntas: [] }
  | { vigente: false; puntajeMinimo: number; preguntas: PreguntaInduccion[] };

export interface ResultadoInduccion {
  aprobada: boolean;
  puntaje: number;
  puntajeMinimo: number;
  correctas: number;
  total: number;
  venceEn: string | null;
}

export interface Credencial {
  codigoQr: string;
  venceEn: string;
  visitante: { nombreCompleto: string; empresa: string };
  visita: { fechaProgramada: string; motivo: string; tiempoAutorizadoMin: number };
  anfitrion: { nombre: string; area: string | null };
}

const base = (token: string) => `/pre-registro/${encodeURIComponent(token)}`;

export const preRegistroApi = {
  estado: (token: string) => apiGet<EstadoPreRegistro>(base(token)),
  guardarDatos: (token: string, datos: DatosPreRegistro) => api<EstadoPreRegistro>(`${base(token)}/datos`, { metodo: 'PUT', cuerpo: datos }),
  consentimiento: (token: string, autorizaBiometria: boolean) =>
    apiPost<EstadoPreRegistro>(`${base(token)}/consentimiento`, { aceptaTratamiento: true, aceptaNda: true, autorizaBiometria }),
  induccion: (token: string) => apiGet<InduccionParaToken>(`${base(token)}/induccion`),
  evaluar: (token: string, respuestas: { preguntaId: string; opcion: number }[]) =>
    apiPost<ResultadoInduccion>(`${base(token)}/induccion`, { respuestas }),
  finalizar: (token: string) => apiPost<{ codigoQr: string | null; venceEn: string | null; estado: EstadoPreRegistro }>(`${base(token)}/finalizar`),
  credencial: (token: string) => apiGet<Credencial>(`${base(token)}/credencial`),
};

export const clavesPreRegistro = {
  estado: (token: string) => ['pre-registro', token, 'estado'] as const,
  induccion: (token: string) => ['pre-registro', token, 'induccion'] as const,
  credencial: (token: string) => ['pre-registro', token, 'credencial'] as const,
};
