'use client';

import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { CapturaHuella } from '@/components/dominio/captura-huella';
import { ModalRegistrarEpp } from '@/components/dominio/modal-registrar-epp';
import { Modal } from '@/components/ui/modal';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { Casilla } from '@/components/ui/casilla';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { Insignia, InsigniaEstadoVisita, type ColorInsignia } from '@/components/ui/insignia';
import { Tarjeta, ListaDescripcion } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearDuracion, formatearFecha, formatearFechaHora } from '@/lib/fechas';
import { NOMBRE_DEDO } from '@/lib/huellero';
import { biometriaApi, clavesBiometria } from '@/services/biometria';
import { checkInApi, clavesCheckIn, type DatosConfirmar, type FichaVisitante, type MotivoCredencialAlternativa, type ResultadoConfirmar } from '@/services/check-in';
import { NOMBRE_EPP, NOMBRE_TIPO_DOCUMENTO } from '@/types/api';
import { ModalInduccion } from './modal-induccion';

interface Props {
  visitaId: string;
  onVolver: () => void;
  onResultado: (r: ResultadoConfirmar) => void;
  onContingencia: (ficha: FichaVisitante) => void;
  onBloqueo: (ficha: FichaVisitante) => void;
}

function Verificacion({ etiqueta, detalle, color, estado, accion }: { etiqueta: string; detalle?: ReactNode; color: ColorInsignia; estado: string; accion?: ReactNode }) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">{etiqueta}</p>
        <Insignia color={color} className="shrink-0">
          {estado}
        </Insignia>
      </div>
      {detalle ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detalle}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </li>
  );
}

/** R2 · Ficha del visitante y lista de verificación. Adaptado de Tailwind Plus · data-display/description-lists y lists/stacked-lists. */
export function FichaVisita({ visitaId, onVolver, onResultado, onContingencia, onBloqueo }: Props) {
  const queryClient = useQueryClient();
  const [identidad, setIdentidad] = useState(false);
  const [modalEpp, setModalEpp] = useState(false);
  const [modalInduccion, setModalInduccion] = useState(false);
  const [placa, setPlaca] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('');
  const [acompananteId, setAcompananteId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [modalAlternativa, setModalAlternativa] = useState(false);
  const [motivoAlternativa, setMotivoAlternativa] = useState<MotivoCredencialAlternativa>('HUELLA_ILEGIBLE');
  const [avisoHuella, setAvisoHuella] = useState<string | null>(null);

  const { data: ficha, isPending, error } = useQuery({ queryKey: clavesCheckIn.ficha(visitaId), queryFn: () => checkInApi.ficha(visitaId) });
  const { data: catalogos } = useQuery({ queryKey: clavesCheckIn.catalogos, queryFn: checkInApi.catalogos });
  const { data: biometria } = useQuery({ queryKey: clavesBiometria.estado(visitaId), queryFn: () => biometriaApi.estado(visitaId) });

  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clavesCheckIn.ficha(visitaId) });

  const confirmar = useMutation({
    mutationFn: () => {
      const datos: DatosConfirmar = {
        identidadVerificada: true,
        ...(placa.trim() ? { vehiculo: { placa: placa.trim(), ...(tipoVehiculo.trim() ? { tipo: tipoVehiculo.trim() } : {}) } } : {}),
        ...(acompananteId ? { acompananteId } : {}),
        ...(zonaId ? { zonaId } : {}),
      };
      return checkInApi.confirmar(visitaId, datos);
    },
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: clavesCheckIn.todas });
      if (r.resultado === 'RECHAZADO') setRechazo(r.motivo ?? 'No se permite el ingreso');
      else onResultado(r);
    },
    onError: (e) => setRechazo(e instanceof ApiError ? e.message : 'No fue posible registrar el ingreso'),
  });

  const alternativa = useMutation({
    mutationFn: () => checkInApi.credencialAlternativa(visitaId, motivoAlternativa),
    onSuccess: () => {
      setModalAlternativa(false);
      refrescar();
    },
    onError: (e) => {
      setModalAlternativa(false);
      setRechazo(e instanceof ApiError ? e.message : 'No fue posible emitir la credencial');
    },
  });

  if (error) {
    return (
      <div className="space-y-4">
        <Alerta tipo="error">{error instanceof ApiError ? error.message : 'No se pudo cargar la ficha del visitante.'}</Alerta>
        <Boton variante="secundario" onClick={onVolver}>
          Volver
        </Boton>
      </div>
    );
  }
  if (isPending || !ficha) return <Cargando texto="Cargando ficha…" />;

  const { visita, visitante, anfitrion, requisitos } = ficha;
  const { restriccion, epp, identificacion } = requisitos;
  const hayCoincidencia = restriccion.estado === 'COINCIDENCIA';
  const enCurso = visita.estado === 'PRE_REGISTRADA' || visita.estado === 'BLOQUEADA';
  // Con coincidencia el bloqueo va antes del EPP (sección 7.2): confirmar dispara el aviso a Seguridad y DPO
  const puedeConfirmar = enCurso && identidad && (hayCoincidencia || requisitos.completos);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={visitante.nombreCompleto}
        descripcion={<InsigniaEstadoVisita estado={visita.estado} />}
        acciones={
          <Boton variante="secundario" iconoInicio={ArrowLeftIcon} onClick={onVolver}>
            Volver
          </Boton>
        }
      />

      {visita.estado === 'EN_PLANTA' ? (
        <Alerta tipo="info" titulo="El visitante ya tiene un check-in activo">
          Ingresó el {visita.horaIngreso ? formatearFechaHora(visita.horaIngreso) : '—'}.
          {ficha.contingencia && !ficha.contingencia.pasoManualEn ? (
            <div className="mt-3">
              <Boton variante="secundario" onClick={() => onContingencia(ficha)}>
                Confirmar paso manual pendiente
              </Boton>
            </div>
          ) : null}
        </Alerta>
      ) : null}
      {visita.estado === 'PROGRAMADA' ? (
        <Alerta tipo="advertencia" titulo="Pre-registro sin completar">
          El visitante debe completar el enlace enviado por correo, o use el registro exprés.
        </Alerta>
      ) : null}
      {visita.estado === 'FINALIZADA' || visita.estado === 'CANCELADA' ? <Alerta tipo="advertencia">Esta visita ya no está activa.</Alerta> : null}
      {rechazo ? (
        <Alerta tipo="error" titulo="No se permite el ingreso">
          {rechazo}
        </Alerta>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Tarjeta titulo="Datos del pre-registro" sinRelleno>
            <ListaDescripcion
              items={[
                { termino: 'Nombre', valor: visitante.nombreCompleto },
                { termino: 'Documento', valor: `${NOMBRE_TIPO_DOCUMENTO[visitante.tipoDocumento]} · ${visitante.numeroDocumento}` },
                { termino: 'Empresa', valor: visitante.empresa },
                { termino: 'Anfitrión', valor: anfitrion.area ? `${anfitrion.nombre} · ${anfitrion.area}` : anfitrion.nombre },
                { termino: 'Motivo', valor: visita.motivo },
              ]}
            />
          </Tarjeta>
          <Tarjeta titulo="Visita" sinRelleno>
            <ListaDescripcion
              items={[
                { termino: 'Fecha', valor: formatearFechaHora(visita.fechaProgramada) },
                { termino: 'Duración autorizada', valor: formatearDuracion(visita.tiempoAutorizadoMin) },
                ...(visita.esExpres ? [{ termino: 'Origen', valor: 'Registro exprés' }] : []),
              ]}
            />
          </Tarjeta>
          {enCurso ? (
            <Tarjeta titulo="Datos opcionales" descripcion="Se guardan al autorizar el ingreso.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo etiqueta="Placa del vehículo" value={placa} onChange={(e) => setPlaca(e.target.value)} />
                <Campo etiqueta="Tipo de vehículo" value={tipoVehiculo} onChange={(e) => setTipoVehiculo(e.target.value)} />
                <Selector
                  etiqueta="Acompañante"
                  marcador="Sin acompañante"
                  value={acompananteId}
                  onChange={(e) => setAcompananteId(e.target.value)}
                  opciones={(catalogos?.acompanantes ?? []).map((a) => ({ valor: a.id, texto: a.area ? `${a.nombre} · ${a.area}` : a.nombre }))}
                />
                <Selector
                  etiqueta="Zona de destino"
                  marcador="Sin zona"
                  value={zonaId}
                  onChange={(e) => setZonaId(e.target.value)}
                  opciones={(catalogos?.zonas ?? []).map((z) => ({ valor: z.id, texto: z.requiereAcompanante ? `${z.nombre} (exige acompañante)` : z.nombre }))}
                />
              </div>
            </Tarjeta>
          ) : null}
        </div>

        <Tarjeta
          titulo="Lista de verificación"
          pie={
            enCurso ? (
              <div className="space-y-3">
                <Boton bloque tamano="xl" disabled={!puedeConfirmar} cargando={confirmar.isPending} onClick={() => { setRechazo(null); confirmar.mutate(); }}>
                  Autorizar ingreso
                </Boton>
                {visita.estado === 'BLOQUEADA' && hayCoincidencia ? (
                  <Boton bloque variante="secundario" onClick={() => onBloqueo(ficha)}>
                    Ver el bloqueo
                  </Boton>
                ) : null}
              </div>
            ) : null
          }
        >
          {enCurso ? (
            // Con huella no se pide el documento (HU-37), pero el visitante confirma los datos precargados (HU-28)
            <Casilla
              etiqueta={identificacion.metodo === 'HUELLA' ? 'Datos confirmados por el visitante' : 'Identidad confirmada'}
              descripcion={identificacion.metodo === 'HUELLA' ? 'El visitante revisó sus datos en la ficha y son correctos.' : 'Comparé el documento físico con los datos de la ficha.'}
              checked={identidad}
              onChange={(e) => setIdentidad(e.target.checked)}
            />
          ) : null}
          <ul role="list" className="mt-3 divide-y divide-gray-100 dark:divide-white/5">
            {biometria?.autorizaBiometria ? (
              <Verificacion
                etiqueta="Huella"
                detalle={biometria.plantillas.length ? biometria.plantillas.map((p) => NOMBRE_DEDO[p.dedo]).join(' y ') : 'Autorizada por el visitante; aún sin registrar'}
                color={biometria.plantillas.length ? 'verde' : 'amarillo'}
                estado={biometria.plantillas.length ? 'Enrolada' : 'Pendiente'}
                accion={
                  visita.estado === 'PRE_REGISTRADA' ? (
                    <div className="space-y-3">
                      {biometria.plantillas.length && identificacion.metodo !== 'HUELLA' ? (
                        <CapturaHuella
                          onIdentificada={(id) => {
                            setAvisoHuella(id === visitaId ? null : 'La huella pertenece a otro visitante de hoy. Verifique la identidad.');
                            refrescar();
                          }}
                        />
                      ) : null}
                      {avisoHuella ? <Alerta tipo="error">{avisoHuella}</Alerta> : null}
                      <div className="flex flex-wrap gap-3">
                        <Boton href={`/recepcion/enrolamiento/${visitaId}`} variante="secundario" tamano="md">
                          {biometria.plantillas.length ? 'Volver a enrolar' : 'Enrolar huella'}
                        </Boton>
                        {identificacion.metodo === null ? (
                          <Boton variante="secundario" tamano="md" onClick={() => setModalAlternativa(true)}>
                            Usar credencial alternativa
                          </Boton>
                        ) : null}
                      </div>
                    </div>
                  ) : null
                }
              />
            ) : null}
            <Verificacion
              etiqueta="Identificación"
              detalle={
                identificacion.metodo === 'HUELLA'
                  ? 'Por huella'
                  : requisitos.credencial.venceEn
                    ? `Credencial alternativa. Vence el ${formatearFechaHora(requisitos.credencial.venceEn)}`
                    : identificacion.autorizaBiometria
                      ? 'Identifique con la huella o use la credencial alternativa'
                      : 'Sin credencial activa'
              }
              color={identificacion.metodo ? 'verde' : 'rojo'}
              estado={identificacion.metodo ? 'Identificado' : 'Pendiente'}
              accion={
                visita.estado === 'PRE_REGISTRADA' && !identificacion.autorizaBiometria && !identificacion.metodo ? (
                  <Boton variante="secundario" tamano="md" onClick={() => setModalAlternativa(true)}>
                    Usar credencial alternativa
                  </Boton>
                ) : null
              }
            />
            <Verificacion
              etiqueta="Inducción vigente"
              detalle={requisitos.induccion.venceEn ? `Hasta el ${formatearFecha(requisitos.induccion.venceEn)}` : 'Debe aprobarla antes de ingresar'}
              color={requisitos.induccion.vigente ? 'verde' : 'rojo'}
              estado={requisitos.induccion.vigente ? 'Vigente' : 'Pendiente'}
              accion={
                !requisitos.induccion.vigente && enCurso ? (
                  <Boton variante="secundario" tamano="md" onClick={() => setModalInduccion(true)}>
                    Realizar inducción
                  </Boton>
                ) : null
              }
            />
            <Verificacion
              etiqueta="Lista de restricción"
              detalle={restriccion.estado === 'EXCEPCION' ? `Autorizada por ${restriccion.autorizadoPor}` : hayCoincidencia ? restriccion.motivo : undefined}
              color={restriccion.estado === 'SIN_COINCIDENCIA' ? 'verde' : restriccion.estado === 'EXCEPCION' ? 'amarillo' : 'rojo'}
              estado={restriccion.estado === 'SIN_COINCIDENCIA' ? 'Sin coincidencia' : restriccion.estado === 'EXCEPCION' ? 'Excepción registrada' : 'Coincidencia'}
            />
            <Verificacion
              etiqueta="EPP entregado"
              detalle={epp.completo ? undefined : `Falta: ${epp.faltantes.map((e) => NOMBRE_EPP[e]).join(', ')}. Registre el EPP para continuar.`}
              color={epp.completo ? 'verde' : 'amarillo'}
              estado={epp.completo ? 'Completo' : 'Pendiente'}
              accion={
                enCurso && !hayCoincidencia ? (
                  <Boton variante="secundario" tamano="md" onClick={() => setModalEpp(true)}>
                    Registrar EPP
                  </Boton>
                ) : null
              }
            />
          </ul>
        </Tarjeta>
      </div>

      <Modal
        abierto={modalAlternativa}
        onCerrar={() => setModalAlternativa(false)}
        titulo="Usar credencial alternativa"
        acciones={
          <>
            <Boton cargando={alternativa.isPending} onClick={() => alternativa.mutate()}>
              Emitir credencial
            </Boton>
            <Boton variante="secundario" onClick={() => setModalAlternativa(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">Se aplican las mismas validaciones: documento, lista de restricción, inducción y EPP.</p>
          <Selector
            etiqueta="Motivo"
            value={motivoAlternativa}
            onChange={(e) => setMotivoAlternativa(e.target.value as MotivoCredencialAlternativa)}
            opciones={[
              { valor: 'HUELLA_ILEGIBLE', texto: 'La huella no puede leerse' },
              { valor: 'HUELLERO_NO_DISPONIBLE', texto: 'El huellero no está disponible' },
              { valor: 'VISITANTE_NO_DESEA', texto: 'El visitante prefiere no usar su huella' },
            ]}
          />
        </div>
      </Modal>
      <ModalRegistrarEpp visitaId={visitaId} abierto={modalEpp} onCerrar={() => setModalEpp(false)} onRegistrado={refrescar} />
      {modalInduccion ? <ModalInduccion visitaId={visitaId} onCerrar={() => setModalInduccion(false)} onAprobada={refrescar} /> : null}
    </div>
  );
}
