import { apiGet } from '@/lib/api';
import type { ElementoEpp, EstadoVisita, EventoBitacora, Paginado, TipoDocumento } from '@/types/api';

export type MetodoIdentificacion = 'HUELLA' | 'CREDENCIAL_ALTERNATIVA' | 'MANUAL_CONTINGENCIA';

export const NOMBRE_METODO: Record<MetodoIdentificacion, string> = { HUELLA: 'Huella', CREDENCIAL_ALTERNATIVA: 'Credencial alternativa', MANUAL_CONTINGENCIA: 'Manual en contingencia' };

export interface VisitaResumen {
  id: string;
  estado: EstadoVisita;
  fechaProgramada: string;
  horaIngreso: string | null;
  horaSalida: string | null;
  motivo: string;
  esExpres: boolean;
  metodoIdentificacion: MetodoIdentificacion | null;
  visitante: { nombreCompleto: string; empresa: string };
  anfitrion: string;
}

export interface VisitaDetalle extends Omit<VisitaResumen, 'visitante' | 'anfitrion'> {
  tiempoAutorizadoMin: number;
  modoContingencia: boolean;
  satisfaccion: number | null;
  visitante: { nombreCompleto: string; tipoDocumento: TipoDocumento; numeroDocumento: string; empresa: string };
  anfitrion: { nombre: string; area: string | null };
  acompanante: string | null;
  credencial: { activa: boolean; venceEn: string; fisicaEntregada: boolean; fisicaDevuelta: boolean } | null;
  consentimiento: { versionPolitica: string; fechaHoraAceptacion: string } | null;
  epp: { elemento: ElementoEpp; entregado: boolean; devuelto: boolean }[];
  vehiculo: { placa: string; tipo: string | null } | null;
  movimientos: { id: string; zona: string; esSensible: boolean; horaEntrada: string; horaSalida: string | null }[];
  eventos: EventoBitacora[];
}

export interface FiltrosVisitas {
  desde?: string;
  hasta?: string;
  empresa?: string;
  documento?: string;
  estado?: string;
  pagina?: number;
}

export const visitasApi = {
  listar: (f: FiltrosVisitas) => apiGet<Paginado<VisitaResumen>>('/visitas', { desde: f.desde, hasta: f.hasta, empresa: f.empresa, documento: f.documento, estado: f.estado, pagina: f.pagina }),
  detalle: (id: string) => apiGet<VisitaDetalle>(`/visitas/${id}`),
};

export const clavesVisitas = {
  todas: ['visitas'] as const,
  lista: (f: FiltrosVisitas) => ['visitas', 'lista', f] as const,
  detalle: (id: string) => ['visitas', 'detalle', id] as const,
};
