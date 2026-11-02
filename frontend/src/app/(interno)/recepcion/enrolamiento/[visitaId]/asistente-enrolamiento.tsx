'use client';

import { CheckCircleIcon, FingerPrintIcon } from '@heroicons/react/20/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoHuellero } from '@/components/dominio/estado-huellero';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Selector } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { Casilla } from '@/components/ui/casilla';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { Pasos } from '@/components/ui/pasos';
import { ListaDescripcion, Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFecha } from '@/lib/fechas';
import { huellero, MENSAJE_CAPTURA, NOMBRE_DEDO, type Dedo } from '@/lib/huellero';
import { biometriaApi, clavesBiometria, type MuestraHuella } from '@/services/biometria';
import { checkInApi, clavesCheckIn } from '@/services/check-in';
import { NOMBRE_TIPO_DOCUMENTO } from '@/types/api';

const PASOS = ['Verificar documento', 'Capturar muestras', 'Confirmación'];
const OPCIONES_DEDO = (Object.entries(NOMBRE_DEDO) as [Dedo, string][]).map(([valor, texto]) => ({ valor, texto }));

/** Asistente de enrolamiento (HU-06, HU-37, Tabla 16). Adaptado de Tailwind Plus · navigation/progress-bars y data-display/description-lists. */
export function AsistenteEnrolamiento({ visitaId }: { visitaId: string }) {
  const queryClient = useQueryClient();
  const [paso, setPaso] = useState(0);
  const [documento, setDocumento] = useState(false);
  const [dedos, setDedos] = useState<[Dedo, Dedo]>(['INDICE_D', 'INDICE_I']);
  const [muestras, setMuestras] = useState<MuestraHuella[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const estado = useQuery({ queryKey: clavesBiometria.estado(visitaId), queryFn: () => biometriaApi.estado(visitaId) });
  const ficha = useQuery({ queryKey: clavesCheckIn.ficha(visitaId), queryFn: () => checkInApi.ficha(visitaId) });

  const capturar = useMutation({
    mutationFn: (dedo: Dedo) => huellero.capturar('ENROLAR', dedo).then((resultado) => ({ dedo, resultado })),
    onMutate: () => setAviso(null),
    onSuccess: ({ dedo, resultado }) => {
      if (!resultado.ok) {
        setAviso(MENSAJE_CAPTURA[resultado.motivo]);
        return;
      }
      if (!resultado.pruebaVida || (estado.data && resultado.calidad < estado.data.calidadMinima)) {
        setAviso(resultado.pruebaVida ? MENSAJE_CAPTURA.CALIDAD_BAJA : MENSAJE_CAPTURA.PRUEBA_VIDA_FALLIDA);
        return;
      }
      setMuestras((actuales) => [...actuales, { dedo, formato: resultado.formato, plantilla: resultado.plantilla, calidad: resultado.calidad, pruebaVida: resultado.pruebaVida }]);
    },
    onError: (e) => setAviso(e instanceof Error ? e.message : 'No fue posible leer el huellero'),
  });

  const enrolar = useMutation({
    mutationFn: () => biometriaApi.enrolar(visitaId, muestras),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesBiometria.todas });
      void queryClient.invalidateQueries({ queryKey: clavesCheckIn.todas });
      setPaso(2);
    },
    onError: (e) => {
      setMuestras([]);
      setAviso(e instanceof ApiError ? e.message : 'No fue posible registrar la huella');
    },
  });

  const encabezado = <EncabezadoPagina titulo="Enrolar huella" acciones={<EstadoHuellero />} />;
  const volver = (
    <Boton href="/recepcion" variante="secundario">
      Volver a recepción
    </Boton>
  );

  if (estado.error || ficha.error) {
    const error = estado.error ?? ficha.error;
    return (
      <div className="space-y-4">
        {encabezado}
        <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo cargar la visita.'}</Alerta>
        {volver}
      </div>
    );
  }
  if (!estado.data || !ficha.data) return <Cargando texto="Cargando visita…" />;

  // Tras guardar, el estado ya incluye plantillas: el paso de confirmación manda sobre estas validaciones
  if (paso < 2 && !estado.data.autorizaBiometria) {
    return (
      <div className="space-y-4">
        {encabezado}
        <Alerta tipo="advertencia" titulo="Sin autorización biométrica">
          El visitante no autorizó el tratamiento de su huella. El ingreso debe hacerse con la credencial alternativa.
        </Alerta>
        {volver}
      </div>
    );
  }
  if (paso < 2 && estado.data.estadoVisita !== 'PRE_REGISTRADA') {
    return (
      <div className="space-y-4">
        {encabezado}
        <Alerta tipo="advertencia">Solo se enrola la huella de una visita con pre-registro completo y sin ingreso.</Alerta>
        {volver}
      </div>
    );
  }

  const { visitante } = ficha.data;
  const { muestrasPorDedo, plantillas } = estado.data;
  const contar = (dedo: Dedo) => muestras.filter((m) => m.dedo === dedo).length;
  const dedoActual = dedos.find((d) => contar(d) < muestrasPorDedo);
  const dedosDistintos = dedos[0] !== dedos[1];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {encabezado}
      <Pasos pasos={PASOS} actual={paso} />
      {aviso ? <Alerta tipo="error">{aviso}</Alerta> : null}

      {paso === 0 ? (
        <Tarjeta
          titulo="Verifique el documento físico"
          sinRelleno
          pie={
            <div className="flex justify-between gap-3">
              {volver}
              <Boton disabled={!documento} onClick={() => setPaso(1)}>
                Continuar
              </Boton>
            </div>
          }
        >
          <ListaDescripcion
            items={[
              { termino: 'Nombre', valor: visitante.nombreCompleto },
              { termino: 'Documento', valor: `${NOMBRE_TIPO_DOCUMENTO[visitante.tipoDocumento]} · ${visitante.numeroDocumento}` },
              { termino: 'Empresa', valor: visitante.empresa },
              ...(plantillas.length ? [{ termino: 'Huella actual', valor: `Se reemplazará la registrada (${plantillas.map((p) => NOMBRE_DEDO[p.dedo]).join(' y ')})` }] : []),
            ]}
          />
          <div className="border-t border-gray-100 p-4 dark:border-white/5">
            <Casilla etiqueta="Documento confirmado" descripcion="Comparé el documento físico con los datos del pre-registro." checked={documento} onChange={(e) => setDocumento(e.target.checked)} />
          </div>
        </Tarjeta>
      ) : null}

      {paso === 1 ? (
        <Tarjeta
          titulo="Capture las muestras"
          descripcion={`${muestrasPorDedo} muestras de cada dedo. Solo se guarda una plantilla cifrada; la imagen se descarta.`}
          pie={
            <div className="flex justify-between gap-3">
              <Boton variante="secundario" onClick={() => { setMuestras([]); setPaso(0); }}>
                Atrás
              </Boton>
              <Boton disabled={Boolean(dedoActual)} cargando={enrolar.isPending} onClick={() => { setAviso(null); enrolar.mutate(); }}>
                Guardar huella
              </Boton>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {dedos.map((dedo, i) => (
              <div key={i}>
                <Selector
                  etiqueta={`Dedo ${i + 1}`}
                  value={dedo}
                  disabled={muestras.length > 0}
                  onChange={(e) => setDedos((actuales) => (i === 0 ? [e.target.value as Dedo, actuales[1]] : [actuales[0], e.target.value as Dedo]))}
                  opciones={OPCIONES_DEDO}
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {contar(dedo)} de {muestrasPorDedo} muestras
                </p>
              </div>
            ))}
          </div>
          {!dedosDistintos ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">Seleccione dos dedos distintos.</p> : null}
          <div className="mt-6">
            {dedoActual ? (
              <Boton bloque tamano="xl" iconoInicio={FingerPrintIcon} disabled={!dedosDistintos} cargando={capturar.isPending} onClick={() => capturar.mutate(dedoActual)}>
                Capturar {NOMBRE_DEDO[dedoActual].toLowerCase()}
              </Boton>
            ) : (
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Muestras completas. Guarde la huella para terminar.</p>
            )}
          </div>
          {aviso ? <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Si la huella no puede leerse, vuelva a recepción y use la credencial alternativa.</p> : null}
        </Tarjeta>
      ) : null}

      {paso === 2 ? (
        <Tarjeta
          titulo="Huella registrada"
          pie={
            <div className="flex justify-end">
              <Boton href={`/recepcion?visita=${visitaId}`}>Continuar con el check-in</Boton>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <CheckCircleIcon aria-hidden="true" className="size-6 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {visitante.nombreCompleto}: {plantillas.map((p) => NOMBRE_DEDO[p.dedo].toLowerCase()).join(' y ')}.
              {plantillas[0] ? ` Vigente hasta el ${formatearFecha(plantillas[0].venceEn)} si no registra nuevas visitas.` : ''}
            </p>
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}
