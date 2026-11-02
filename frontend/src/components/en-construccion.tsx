import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Tarjeta } from '@/components/ui/tarjeta';

interface Props {
  titulo: string;
  sprint: string;
  descripcion?: string;
}

/** Marcador de vistas pendientes. Se reemplaza en el sprint indicado. */
export function EnConstruccion({ titulo, sprint, descripcion }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <EncabezadoPagina titulo={titulo} />
      <Tarjeta>
        <EstadoVacio icono={WrenchScrewdriverIcon} titulo="En construcción" descripcion={`${descripcion ?? ''} Esta vista se implementa en el ${sprint}.`} />
      </Tarjeta>
    </div>
  );
}
