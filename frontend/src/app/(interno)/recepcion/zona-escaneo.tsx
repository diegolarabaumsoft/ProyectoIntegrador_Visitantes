'use client';

import { MagnifyingGlassIcon, UserPlusIcon } from '@heroicons/react/20/solid';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { CapturaHuella } from '@/components/dominio/captura-huella';
import { EstadoHuellero } from '@/components/dominio/estado-huellero';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { InsigniaEstadoVisita } from '@/components/ui/insignia';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { checkInApi } from '@/services/check-in';
import { LectorQr } from './lector-qr';

interface Props {
  onFicha: (visitaId: string) => void;
  onExpres: () => void;
}

/**
 * R1 · Identificar visitante: huella como medio principal y QR con documento como alternativa (Tabla 16).
 * Adaptado de Tailwind Plus · feedback/empty-states y lists/stacked-lists.
 */
export function ZonaEscaneo({ onFicha, onExpres }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);

  const escanear = useMutation({
    mutationFn: checkInApi.escanear,
    onSuccess: (r) => {
      if (r.resultado === 'VALIDA') onFicha(r.ficha.visita.id);
      else setRechazo(r.mensaje);
    },
    onError: (e) => setErrorLectura(e instanceof ApiError ? e.message : 'Intente de nuevo.'),
  });

  const buscar = useMutation({
    mutationFn: (texto: string) => checkInApi.buscar(/\d/.test(texto) ? { documento: texto } : { nombre: texto }),
  });

  const enviarCodigo = (valor: string) => {
    setRechazo(null);
    setErrorLectura(null);
    escanear.mutate(valor);
  };

  const enviarBusqueda = (e: FormEvent) => {
    e.preventDefault();
    if (busqueda.trim()) buscar.mutate(busqueda.trim());
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Identificar visitante"
        descripcion={<EstadoHuellero />}
        acciones={
          <div className="flex flex-col items-end gap-1">
            <Boton variante="secundario" iconoInicio={UserPlusIcon} onClick={onExpres}>
              Registro exprés
            </Boton>
            <span className="text-xs text-gray-500 dark:text-gray-400">Para visitas no planificadas</span>
          </div>
        }
      />

      {rechazo ? (
        <Alerta tipo="error" titulo="Credencial rechazada">
          {rechazo}
        </Alerta>
      ) : null}

      {errorLectura ? (
        <Alerta tipo="error" titulo="No se pudo validar la credencial">
          {errorLectura}
        </Alerta>
      ) : null}

      <LectorQr onLectura={enviarCodigo} />

      <Tarjeta titulo="Coloque su dedo" descripcion="Se compara con los visitantes de hoy que autorizaron su huella.">
        <CapturaHuella onIdentificada={onFicha} />
      </Tarjeta>

      <Tarjeta titulo="Credencial alternativa">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {escanear.isPending ? 'Validando credencial…' : 'Escanee el código QR con el lector USB y verifique el documento físico.'} Quien no se enroló en una visita anterior se busca abajo, por documento o nombre, para registrar su huella o emitir su credencial.
        </p>
      </Tarjeta>

      <Tarjeta titulo="Búsqueda manual" descripcion="Si el QR no se puede leer, busque por documento o por nombre (visitas de hoy).">
        <form onSubmit={enviarBusqueda} className="flex items-start gap-3">
          <Campo className="flex-1" aria-label="Documento o nombre" placeholder="Documento o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <Boton type="submit" iconoInicio={MagnifyingGlassIcon} cargando={buscar.isPending}>
            Buscar
          </Boton>
        </form>
        {buscar.isError ? (
          <Alerta tipo="error" className="mt-4">
            {buscar.error instanceof ApiError ? buscar.error.message : 'No fue posible realizar la búsqueda'}
          </Alerta>
        ) : null}
        {buscar.data?.length === 0 ? <EstadoVacio className="py-6" titulo="Sin resultados" descripcion="Verifique el dato o use el registro exprés." /> : null}
        {buscar.data && buscar.data.length > 0 ? (
          <ul role="list" className="mt-4 divide-y divide-gray-100 dark:divide-white/5">
            {buscar.data.map((v) => (
              <li key={v.visitaId} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{v.visitante.nombreCompleto}</p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {v.visitante.empresa} · {v.anfitrion} · {formatearFechaHora(v.fechaProgramada)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <InsigniaEstadoVisita estado={v.estado} />
                  <Boton variante="secundario" tamano="md" onClick={() => onFicha(v.visitaId)}>
                    Abrir ficha
                  </Boton>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Tarjeta>
    </div>
  );
}
