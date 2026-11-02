'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { useQuery } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { useRef } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Cargando } from '@/components/ui/cargando';
import { Insignia } from '@/components/ui/insignia';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearDuracion, formatearFechaHora } from '@/lib/fechas';
import { clavesPreRegistro, preRegistroApi } from '@/services/pre-registro';

/** V6 · Credencial QR (HU-05). */
export function PasoCredencial({ token }: { token: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const { data, isPending, error } = useQuery({ queryKey: clavesPreRegistro.credencial(token), queryFn: () => preRegistroApi.credencial(token) });

  function descargar() {
    const canvas = contenedor.current?.querySelector('canvas');
    if (!canvas) return;
    const enlace = document.createElement('a');
    enlace.href = canvas.toDataURL('image/png');
    enlace.download = 'credencial-vms.png';
    enlace.click();
  }

  if (error) return <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo cargar la credencial.'}</Alerta>;
  if (isPending || !data) return <Cargando texto="Preparando su credencial…" />;

  const vigente = new Date(data.venceEn) > new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Su credencial de ingreso</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Presente este código en recepción junto con su documento de identidad.</p>
      </div>

      <div className="rounded-lg bg-white p-6 text-center shadow-sm dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10">
        <div ref={contenedor} className="mx-auto inline-block rounded-md bg-white p-3">
          <QRCodeCanvas value={data.codigoQr} size={220} level="M" includeMargin={false} />
        </div>
        <div className="mt-4">
          <Insignia color={vigente ? 'verde' : 'rojo'}>{vigente ? `Vigente hasta ${formatearFechaHora(data.venceEn)}` : 'Vencida'}</Insignia>
        </div>
        <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
          {data.visitante.nombreCompleto} · {data.visitante.empresa}
        </p>
      </div>

      <Tarjeta titulo="Instrucciones para el ingreso">
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Llegue 10 minutos antes de la hora programada con su documento físico.</li>
          <li>Recepción escaneará el QR y verificará su identidad.</li>
          <li>Recibirá el equipo de protección personal (EPP) obligatorio antes de ingresar a planta.</li>
          <li>Al salir, registre su check-out y devuelva la credencial y el EPP.</li>
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Datos de la visita" sinRelleno>
        <ListaDescripcion
          items={[
            { termino: 'Fecha y hora', valor: formatearFechaHora(data.visita.fechaProgramada) },
            { termino: 'Motivo', valor: data.visita.motivo },
            { termino: 'Permanencia autorizada', valor: formatearDuracion(data.visita.tiempoAutorizadoMin) },
            { termino: 'Anfitrión', valor: `${data.anfitrion.nombre}${data.anfitrion.area ? ` · ${data.anfitrion.area}` : ''}` },
          ]}
        />
      </Tarjeta>

      <Alerta tipo="info">También le enviamos esta credencial por correo. Guarde este enlace: podrá volver a abrir su QR cuando lo necesite.</Alerta>

      <Boton bloque tamano="xl" iconoInicio={ArrowDownTrayIcon} onClick={descargar}>
        Guardar imagen del QR
      </Boton>
    </div>
  );
}
