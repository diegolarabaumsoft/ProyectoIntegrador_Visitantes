import { apiGet, apiPost } from '@/lib/api';
import type { EstadoEpp } from '@/services/epp';
import type { EstadoVisita, TipoDocumento } from '@/types/api';

export type MetodoIdentificacion = 'HUELLA' | 'CREDENCIAL_ALTERNATIVA' | 'MANUAL_CONTINGENCIA';
export type MotivoCredencialAlternativa = 'HUELLA_ILEGIBLE' | 'HUELLERO_NO_DISPONIBLE' | 'VISITANTE_NO_DESEA';

export type EstadoRestriccion = 'SIN_COINCIDENCIA' | 'COINCIDENCIA' | 'EXCEPCION';

export interface Requisitos {
  credencial: { vigente: boolean; venceEn: string | null };
  identificacion: { metodo: MetodoIdentificacion | null; autorizaBiometria: boolean; enrolada: boolean };
  induccion: { vigente: boolean; venceEn: string | null };
  restriccion: { estado: EstadoRestriccion; motivo?: string; fechaRegistro?: string; autorizadoPor?: string };
  epp: EstadoEpp;
  completos: boolean;
}

export interface FichaVisitante {
  visita: {
    id: string;
    estado: EstadoVisita;
    fechaProgramada: string;
    motivo: string;
    tiempoAutorizadoMin: number;
    horaIngreso: string | null;
    modoContingencia: boolean;
    esExpres: boolean;
  };
  visitante: { nombreCompleto: string; tipoDocumento: TipoDocumento; numeroDocumento: string; empresa: string };
  anfitrion: { nombre: string; area: string | null };
  requisitos: Requisitos;
  contingencia: { pasoManualEn: string | null } | null;
}

export type ResultadoEscaneo =
  | { resultado: 'VALIDA'; ficha: FichaVisitante }
  | { resultado: 'RECHAZADO'; motivo: string; mensaje: string };

export interface VisitaEncontrada {
  visitaId: string;
  estado: EstadoVisita;
  fechaProgramada: string;
  motivo: string;
  visitante: { nombreCompleto: string; empresa: string };
  anfitrion: string;
}

export interface DatosConfirmar {
  identidadVerificada: true;
  vehiculo?: { placa: string; tipo?: string };
  acompananteId?: string;
  zonaId?: string;
}

export interface ResultadoConfirmar {
  resultado: 'AUTORIZADO' | 'CONTINGENCIA' | 'BLOQUEADO' | 'RECHAZADO';
  motivo?: string;
  selloTiempo?: string;
  fechaRegistro?: string;
  ficha: FichaVisitante;
}

export interface DatosExpres {
  nombreCompleto: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  empresa: string;
  correo?: string;
  anfitrionId: string;
  motivo: string;
  aceptaTratamiento: true;
  aceptaNda: true;
  autorizaBiometria?: boolean;
}

export type ResultadoExpres = { resultado: 'CREADA'; ficha: FichaVisitante } | { resultado: 'BLOQUEADO'; motivo: string; fechaRegistro: string; ficha: FichaVisitante };

export interface Catalogos {
  anfitriones: { id: string; nombre: string; area: string | null }[];
  acompanantes: { id: string; nombre: string; area: string | null }[];
  zonas: { id: string; nombre: string; esSensible: boolean; requiereAcompanante: boolean }[];
}

export interface InduccionRecepcion {
  vigente: boolean;
  puntajeMinimo: number;
  preguntas: { id: string; orden: number; enunciado: string; opciones: string[] }[];
}

export interface ResultadoInduccion {
  aprobada: boolean;
  puntaje: number;
  puntajeMinimo: number;
}

export const checkInApi = {
  escanear: (codigo: string) => apiPost<ResultadoEscaneo>('/check-in/escanear', { codigo }),
  buscar: (filtros: { documento?: string; nombre?: string }) => apiGet<VisitaEncontrada[]>('/check-in/buscar', filtros),
  catalogos: () => apiGet<Catalogos>('/check-in/catalogos'),
  ficha: (visitaId: string) => apiGet<FichaVisitante>(`/visitas/${visitaId}/requisitos`),
  confirmar: (visitaId: string, datos: DatosConfirmar) => apiPost<ResultadoConfirmar>(`/check-in/${visitaId}/confirmar`, datos),
  credencialAlternativa: (visitaId: string, motivo: MotivoCredencialAlternativa) => apiPost<FichaVisitante>(`/check-in/${visitaId}/credencial-alternativa`, { motivo }),
  contingencia: (visitaId: string) => apiPost<{ pasoManualEn: string }>(`/check-in/${visitaId}/contingencia`),
  excepcion: (visitaId: string, datos: { justificacion: string; autorizadoPor: string }) => apiPost<FichaVisitante>(`/visitas/${visitaId}/excepcion`, datos),
  expres: (datos: DatosExpres) => apiPost<ResultadoExpres>('/check-in/expres', datos),
  induccion: (visitaId: string) => apiGet<InduccionRecepcion>(`/visitas/${visitaId}/induccion`),
  evaluarInduccion: (visitaId: string, respuestas: { preguntaId: string; opcion: number }[]) =>
    apiPost<ResultadoInduccion>(`/visitas/${visitaId}/induccion`, { respuestas }),
};

export const clavesCheckIn = {
  todas: ['check-in'] as const,
  catalogos: ['check-in', 'catalogos'] as const,
  ficha: (visitaId: string) => ['check-in', 'ficha', visitaId] as const,
  induccion: (visitaId: string) => ['check-in', 'induccion', visitaId] as const,
};
