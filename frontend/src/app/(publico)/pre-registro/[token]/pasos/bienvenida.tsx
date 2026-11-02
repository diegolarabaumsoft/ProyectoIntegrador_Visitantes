import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { formatearFechaHora } from '@/lib/fechas';
import type { EstadoPreRegistro } from '@/services/pre-registro';

/** V1 · Bienvenida. */
export function Bienvenida({ estado, onComenzar }: { estado: EstadoPreRegistro; onComenzar: () => void }) {
  const yaEmpezo = estado.paso !== 'DATOS';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Bienvenido, {estado.visitante.nombreCompleto.split(' ')[0]}</h1>
        <p className="mt-2 text-base text-gray-600 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-white">{estado.anfitrion.nombre}</span> le ha invitado a una visita a la planta.
        </p>
      </div>

      <Tarjeta sinRelleno>
        <ListaDescripcion
          items={[
            { termino: 'Fecha y hora', valor: formatearFechaHora(estado.visita.fechaProgramada) },
            { termino: 'Motivo', valor: estado.visita.motivo },
            { termino: 'Anfitrión', valor: `${estado.anfitrion.nombre}${estado.anfitrion.area ? ` · ${estado.anfitrion.area}` : ''}` },
            { termino: 'Lugar', valor: 'Planta de producción textil · Bogotá' },
          ]}
        />
      </Tarjeta>

      {estado.esRecurrente ? (
        <Alerta tipo="info" titulo="Ya nos ha visitado antes">
          Sus datos quedaron precargados de su última visita. Solo tendrá que confirmarlos.
        </Alerta>
      ) : null}

      <p className="text-sm text-gray-500 dark:text-gray-400">
        El pre-registro toma menos de 5 minutos: sus datos, el consentimiento de tratamiento de datos y una breve inducción de seguridad.
        Al terminar recibirá un código QR para ingresar.
      </p>

      <Boton bloque tamano="xl" iconoFin={ArrowRightIcon} onClick={onComenzar}>
        {yaEmpezo ? 'Continuar pre-registro' : 'Comenzar'}
      </Boton>
    </div>
  );
}
