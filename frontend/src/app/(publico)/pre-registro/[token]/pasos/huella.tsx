'use client';

import { FingerPrintIcon } from '@heroicons/react/24/outline';
import { Alerta } from '@/components/ui/alerta';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { formatearDuracion, formatearFechaHora } from '@/lib/fechas';
import type { EstadoPreRegistro } from '@/services/pre-registro';

/** Confirmación para quien autorizó la biometría (HU-05, Tabla 16). No se emite QR. */
export function PasoHuella({ estado }: { estado: EstadoPreRegistro }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <FingerPrintIcon aria-hidden="true" className="mx-auto size-12 text-indigo-600 dark:text-indigo-400" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Pre-registro completo</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {estado.huellaEnrolada ? 'El día de la visita, coloque su dedo en el huellero de recepción.' : 'Registre su huella en recepción el día de la visita.'}
        </p>
      </div>

      <Tarjeta titulo="Instrucciones para el ingreso">
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Llegue 10 minutos antes de la hora programada.</li>
          {estado.huellaEnrolada ? null : <li>Traiga su documento físico: recepción lo verificará antes de registrar su huella.</li>}
          <li>Recibirá el equipo de protección personal (EPP) obligatorio antes de ingresar a planta.</li>
          <li>Al salir, devuelva el EPP en recepción.</li>
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Datos de la visita" sinRelleno>
        <ListaDescripcion
          items={[
            { termino: 'Fecha y hora', valor: formatearFechaHora(estado.visita.fechaProgramada) },
            { termino: 'Motivo', valor: estado.visita.motivo },
            { termino: 'Permanencia autorizada', valor: formatearDuracion(estado.visita.tiempoAutorizadoMin) },
            { termino: 'Anfitrión', valor: `${estado.anfitrion.nombre}${estado.anfitrion.area ? ` · ${estado.anfitrion.area}` : ''}` },
          ]}
        />
      </Tarjeta>

      <Alerta tipo="info">Si su huella no puede leerse, recepción le dará ingreso con un código QR y su documento, con las mismas condiciones.</Alerta>
    </div>
  );
}
