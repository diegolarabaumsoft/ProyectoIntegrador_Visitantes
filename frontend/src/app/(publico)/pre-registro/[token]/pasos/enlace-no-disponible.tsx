import { ClockIcon, LinkSlashIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { Insignia } from '@/components/ui/insignia';
import { formatearFechaHora } from '@/lib/fechas';

interface Props {
  codigo: string;
  mensaje: string;
  detalles?: unknown;
}

/** V7 · Enlace vencido, cancelado o inválido. */
export function EnlaceNoDisponible({ codigo, mensaje, detalles }: Props) {
  const vencimiento = (detalles as { vencimientoEnlace?: string } | undefined)?.vencimientoEnlace;
  const config = {
    ENLACE_VENCIDO: { Icono: ClockIcon, etiqueta: 'Enlace vencido', titulo: 'Este enlace ya no es válido' },
    VISITA_CANCELADA: { Icono: XCircleIcon, etiqueta: 'Visita cancelada', titulo: 'La visita fue cancelada' },
    ENLACE_INVALIDO: { Icono: LinkSlashIcon, etiqueta: 'Enlace inválido', titulo: 'No encontramos esta invitación' },
  }[codigo] ?? { Icono: LinkSlashIcon, etiqueta: 'No disponible', titulo: 'No fue posible abrir el enlace' };

  return (
    <div className="flex flex-col items-center py-12 text-center">
      <config.Icono aria-hidden="true" className="size-14 text-gray-400 dark:text-gray-500" />
      <div className="mt-4">
        <Insignia color="rojo">{config.etiqueta}</Insignia>
      </div>
      <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{config.titulo}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">{mensaje}</p>
      {vencimiento ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Expiró el {formatearFechaHora(vencimiento)}.</p> : null}
      <p className="mt-6 text-sm text-gray-700 dark:text-gray-300">Contacte a su anfitrión para que le envíe un nuevo enlace.</p>
    </div>
  );
}
