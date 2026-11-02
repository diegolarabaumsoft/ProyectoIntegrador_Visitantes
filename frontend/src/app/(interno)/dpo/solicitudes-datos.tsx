'use client';

import { PlusIcon } from '@heroicons/react/20/solid';
import { DocumentTextIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { AreaTexto, Campo, Selector } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { formatearFecha } from '@/lib/fechas';
import { clavesPrivacidad, NOMBRE_TIPO_SOLICITUD, privacidadApi, type Solicitud, type TipoSolicitud } from '@/services/privacidad';

const mensajeDe = (e: unknown) => (e instanceof ApiError ? e.message : undefined);
const TIPOS = (Object.keys(NOMBRE_TIPO_SOLICITUD) as TipoSolicitud[]).map((valor) => ({ valor, texto: NOMBRE_TIPO_SOLICITUD[valor] }));

function plazo(s: Solicitud): string {
  if (s.fechaRespuesta) return `Atendida el ${formatearFecha(s.fechaRespuesta)}`;
  return `${s.estado === 'VENCIDA' ? 'Venció' : 'Vence'} el ${formatearFecha(s.fechaLimite)}`;
}

/** DP1 · Solicitudes de los titulares. Adaptado de Tailwind Plus · lists/tables y overlays/modal-dialogs. */
export function SolicitudesDatos() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [registrando, setRegistrando] = useState(false);
  const [tipo, setTipo] = useState<TipoSolicitud>('CONSULTA');
  const [documento, setDocumento] = useState('');
  const [atendiendo, setAtendiendo] = useState<Solicitud | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const { data, isPending, error } = useQuery({ queryKey: clavesPrivacidad.solicitudes, queryFn: privacidadApi.solicitudes });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clavesPrivacidad.solicitudes });

  const registrar = useMutation({
    mutationFn: () => privacidadApi.registrar({ tipo, numeroDocumento: documento.trim() }),
    onSuccess: () => {
      refrescar();
      setRegistrando(false);
      setDocumento('');
      notificar.exito('Solicitud registrada');
    },
  });
  const atender = useMutation({
    mutationFn: () => privacidadApi.atender(atendiendo!.id, respuesta.trim()),
    onSuccess: () => {
      refrescar();
      setAtendiendo(null);
      setRespuesta('');
      notificar.exito('Solicitud atendida');
    },
  });
  const anonimiza = atendiendo?.tipo === 'ELIMINACION' || atendiendo?.tipo === 'ANONIMIZACION';
  const revoca = atendiendo?.tipo === 'REVOCACION_BIOMETRICA';
  const irreversible = anonimiza || revoca;
  const datos = useMutation({ mutationFn: privacidadApi.datos });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Solicitudes de los titulares"
        descripcion="Cada solicitud debe atenderse en máximo 15 días hábiles."
        acciones={
          <Boton iconoInicio={PlusIcon} onClick={() => { registrar.reset(); setRegistrando(true); }}>
            Registrar solicitud
          </Boton>
        }
      />
      {error ? <Alerta tipo="error" titulo="No se pudieron cargar las solicitudes">{mensajeDe(error)}</Alerta> : null}
      {isPending ? <Esqueleto lineas={5} /> : null}
      {data?.length === 0 ? <EstadoVacio icono={DocumentTextIcon} titulo="Sin solicitudes" /> : null}
      {data && data.length > 0 ? (
        <Tabla>
          <Cabecera>
            <Th primera>Titular</Th>
            <Th>Tipo</Th>
            <Th>Recepción</Th>
            <Th>Plazo</Th>
            <Th>Estado</Th>
            <Th ultima>Acción</Th>
          </Cabecera>
          <Cuerpo>
            {data.map((s) => (
              <tr key={s.id}>
                <Td primera principal>
                  {s.titular}
                </Td>
                <Td>{NOMBRE_TIPO_SOLICITUD[s.tipo]}</Td>
                <Td>{formatearFecha(s.fechaRecepcion)}</Td>
                <Td>{plazo(s)}</Td>
                <Td>{s.estado === 'ATENDIDA' ? <Insignia color="verde">Atendida</Insignia> : s.estado === 'VENCIDA' ? <Insignia color="rojo">Vencida</Insignia> : <Insignia color="amarillo">Pendiente</Insignia>}</Td>
                <Td ultima>
                  {s.estado === 'ATENDIDA' ? null : (
                    <Boton variante="secundario" tamano="sm" onClick={() => { atender.reset(); datos.reset(); setAtendiendo(s); }}>
                      Atender
                    </Boton>
                  )}
                </Td>
              </tr>
            ))}
          </Cuerpo>
        </Tabla>
      ) : null}

      <Modal
        abierto={registrando}
        onCerrar={() => setRegistrando(false)}
        titulo="Registrar solicitud"
        acciones={
          <>
            <Boton disabled={documento.trim().length < 5} cargando={registrar.isPending} onClick={() => registrar.mutate()}>
              Registrar
            </Boton>
            <Boton variante="secundario" onClick={() => setRegistrando(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <Selector etiqueta="Tipo" opciones={TIPOS} value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitud)} />
          <Campo etiqueta="Documento del titular" value={documento} onChange={(e) => setDocumento(e.target.value)} />
          {registrar.isError ? <Alerta tipo="error">{mensajeDe(registrar.error) ?? 'No se pudo registrar'}</Alerta> : null}
        </div>
      </Modal>

      <Modal
        abierto={atendiendo !== null}
        onCerrar={() => setAtendiendo(null)}
        titulo="Atender solicitud"
        descripcion={atendiendo ? `${atendiendo.titular} · ${NOMBRE_TIPO_SOLICITUD[atendiendo.tipo]}` : undefined}
        icono={irreversible ? ExclamationTriangleIcon : undefined}
        tonoIcono="rojo"
        acciones={
          <>
            <Boton variante={irreversible ? 'peligro' : 'primario'} disabled={respuesta.trim().length < 3} cargando={atender.isPending} onClick={() => atender.mutate()}>
              {anonimiza ? 'Anonimizar y atender' : revoca ? 'Eliminar huella y atender' : 'Atender'}
            </Boton>
            <Boton variante="secundario" onClick={() => setAtendiendo(null)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          {revoca ? <Alerta tipo="advertencia">Las plantillas de huella se eliminarán de forma irreversible. Los demás datos se conservan, y sus visitas abiertas usarán la credencial alternativa.</Alerta> : null}
          {anonimiza ? <Alerta tipo="advertencia">Los datos personales y las plantillas de huella del titular se eliminarán o anonimizarán de forma irreversible. La bitácora y los datos agregados se conservan.</Alerta> : null}
          {atendiendo?.tipo === 'CONSULTA' ? (
            datos.data ? (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <p>{datos.data.nombreCompleto} · {datos.data.numeroDocumento} · {datos.data.empresa}</p>
                <p>{datos.data.correo || 'Sin correo'} · {datos.data.telefono ?? 'Sin teléfono'}</p>
                <ul className="mt-2 list-disc pl-5">
                  {datos.data.visitas.map((v) => (
                    <li key={v.id}>{formatearFecha(v.fechaProgramada)} · {v.motivo}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <Boton variante="secundario" cargando={datos.isPending} onClick={() => datos.mutate(atendiendo.id)}>
                Ver datos del titular
              </Boton>
            )
          ) : null}
          {datos.isError ? <Alerta tipo="error">{mensajeDe(datos.error) ?? 'No se pudieron cargar los datos'}</Alerta> : null}
          <AreaTexto etiqueta="Respuesta al titular" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
          {atender.isError ? <Alerta tipo="error">{mensajeDe(atender.error) ?? 'No se pudo atender'}</Alerta> : null}
        </div>
      </Modal>
    </div>
  );
}
