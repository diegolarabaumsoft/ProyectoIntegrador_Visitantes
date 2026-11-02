'use client';

import { ArrowPathIcon, KeyIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/20/solid';
import { FingerPrintIcon } from '@heroicons/react/24/outline';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { clavesPermanencia, permanenciaApi } from '@/services/permanencia';
import { clavesTerminales, NOMBRE_TIPO_TERMINAL, terminalesApi, type Terminal, type TipoTerminal } from '@/services/terminales';
import { clavesZonas, zonasApi } from '@/services/zonas';

const esquema = z
  .object({
    nombre: z.string().trim().min(2, 'Indique el nombre').max(80, 'Máximo 80 caracteres'),
    tipo: z.enum(['ENTRADA', 'SALIDA', 'ZONA']),
    ip: z.string().trim().min(3, 'Indique la dirección').max(80, 'Máximo 80 caracteres'),
    zonaId: z.string(),
  })
  .refine((v) => v.tipo !== 'ZONA' || v.zonaId !== '', { path: ['zonaId'], message: 'Seleccione la zona' });
type Formulario = z.infer<typeof esquema>;

const TIPOS = (Object.keys(NOMBRE_TIPO_TERMINAL) as TipoTerminal[]).map((valor) => ({ valor, texto: NOMBRE_TIPO_TERMINAL[valor] }));
const VACIO: Formulario = { nombre: '', tipo: 'ENTRADA', ip: '', zonaId: '' };
const mensajeDe = (e: unknown) => (e instanceof ApiError ? e.message : undefined);

/** AD · Terminales biométricos (HU-38, Tabla 16). Adaptado de Tailwind Plus · lists/tables y overlays/modal-dialogs. */
export function ListaTerminales() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editando, setEditando] = useState<Terminal | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [simulando, setSimulando] = useState<Terminal | null>(null);
  const [gestionandoId, setGestionandoId] = useState<string | null>(null);
  const [visitaId, setVisitaId] = useState('');

  const { data, isPending, error } = useQuery({ queryKey: clavesTerminales.todas, queryFn: terminalesApi.listar, refetchInterval: 15_000 });
  const { data: zonas = [] } = useQuery({ queryKey: clavesZonas.lista({ activa: true }), queryFn: () => zonasApi.listar({ activa: true }) });
  const presentes = useQuery({ queryKey: clavesPermanencia.presentes(), queryFn: () => permanenciaApi.presentes(), enabled: simulando !== null });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clavesTerminales.todas });
  const form = useForm<Formulario>({ resolver: zodResolver(esquema), defaultValues: VACIO });
  const tipoElegido = useWatch({ control: form.control, name: 'tipo' });

  const abrir = (terminal: Terminal | null) => {
    setEditando(terminal);
    guardar.reset();
    form.reset(terminal ? { nombre: terminal.nombre, tipo: terminal.tipo, ip: terminal.ip, zonaId: terminal.zona?.id ?? '' } : VACIO);
    setFormularioAbierto(true);
  };

  const guardar = useMutation({
    mutationFn: async ({ zonaId, ...v }: Formulario) => {
      const datos = { ...v, ...(v.tipo === 'ZONA' ? { zonaId } : {}) };
      if (editando) {
        await terminalesApi.editar(editando.id, datos);
        return null;
      }
      return (await terminalesApi.crear(datos)).secreto;
    },
    onSuccess: (nuevo) => {
      refrescar();
      setFormularioAbierto(false);
      if (nuevo) setSecreto(nuevo);
      else notificar.exito('Terminal actualizado');
    },
  });
  const regenerar = useMutation({
    mutationFn: (terminal: Terminal) => terminalesApi.regenerarSecreto(terminal.id),
    onSuccess: (r) => {
      refrescar();
      setSecreto(r.secreto);
    },
    onError: (e) => notificar.error('No se pudo regenerar el secreto', mensajeDe(e)),
  });
  const sincronizar = useMutation({
    mutationFn: (terminal: Terminal) => terminalesApi.sincronizar(terminal.id),
    onSuccess: () => {
      refrescar();
      notificar.exito('Sincronización ejecutada');
    },
    onError: (e) => notificar.error('No se pudo sincronizar', mensajeDe(e)),
  });
  const activar = useMutation({
    mutationFn: (terminal: Terminal) => terminalesApi.editar(terminal.id, { activo: !terminal.activo }),
    onSuccess: refrescar,
    onError: (e) => notificar.error('No se pudo cambiar el terminal', mensajeDe(e)),
  });
  const conexion = useMutation({
    mutationFn: (terminal: Terminal) => terminalesApi.configurarSimulado(terminal.id, !terminal.simuladoEnLinea),
    onSuccess: refrescar,
    onError: (e) => notificar.error('No se pudo cambiar la conexión simulada', mensajeDe(e)),
  });
  const simular = useMutation({
    mutationFn: () => terminalesApi.simularPaso(simulando!.id, visitaId),
    onSuccess: () => {
      refrescar();
      void queryClient.invalidateQueries({ queryKey: clavesPermanencia.todas });
      setSimulando(null);
      setVisitaId('');
      notificar.exito('Paso registrado');
    },
  });

  if (error) return <Alerta tipo="error">{mensajeDe(error) ?? 'No se pudieron cargar los terminales.'}</Alerta>;
  if (isPending || !data) return <Cargando texto="Cargando terminales…" />;

  // Se lee de la lista para reflejar los cambios mientras la ventana sigue abierta
  const gestionando = data.terminales.find((t) => t.id === gestionandoId) ?? null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Terminales biométricos"
        descripcion="Torniquetes de entrada y salida, y lectores de zona."
        acciones={
          <Boton iconoInicio={PlusIcon} onClick={() => abrir(null)}>
            Registrar terminal
          </Boton>
        }
      />

      {data.simulado ? (
        <Alerta tipo="advertencia" titulo="Terminales simulados">
          No hay equipos físicos conectados. Use «Simular paso» y «Desconectar» para probar el flujo.
        </Alerta>
      ) : null}

      {data.terminales.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={FingerPrintIcon} titulo="Sin terminales" descripcion="Registre el primer terminal de la planta." />
        </Tarjeta>
      ) : (
        <Tabla>
          <Cabecera>
            <Th primera>Terminal</Th>
            <Th>Tipo</Th>
            <Th>Estado</Th>
            <Th>Última sincronización</Th>
            <Th>Pendientes</Th>
            <Th ultima>Acciones</Th>
          </Cabecera>
          <Cuerpo>
            {data.terminales.map((t) => (
              <tr key={t.id}>
                <Td primera>
                  <p className="font-medium text-gray-900 dark:text-white">{t.nombre}</p>
                  <p className="text-gray-500 dark:text-gray-400">{t.ip}</p>
                </Td>
                <Td>{t.zona ? `${NOMBRE_TIPO_TERMINAL[t.tipo]} · ${t.zona.nombre}` : NOMBRE_TIPO_TERMINAL[t.tipo]}</Td>
                <Td>{!t.activo ? <Insignia color="gris">Inactivo</Insignia> : t.enLinea ? <Insignia color="verde">En línea</Insignia> : <Insignia color="rojo">Fuera de línea</Insignia>}</Td>
                <Td>{t.ultimaSincronizacion ? formatearFechaHora(t.ultimaSincronizacion) : 'Sin registro'}</Td>
                <Td>{t.pendientes}</Td>
                <Td ultima>
                  <Boton variante="secundario" tamano="sm" onClick={() => setGestionandoId(t.id)}>
                    Administrar
                  </Boton>
                </Td>
              </tr>
            ))}
          </Cuerpo>
        </Tabla>
      )}

      <Modal
        abierto={gestionando !== null}
        onCerrar={() => setGestionandoId(null)}
        titulo={gestionando?.nombre ?? ''}
        acciones={
          <Boton variante="secundario" onClick={() => setGestionandoId(null)}>
            Cerrar
          </Boton>
        }
      >
        {gestionando ? (
                        <div className="flex flex-col gap-3">
                          {gestionando.activo ? (
                            <>
                              {data.simulado ? (
                                <>
                                  <Boton variante="secundario" bloque onClick={() => { simular.reset(); setVisitaId(''); setGestionandoId(null); setSimulando(gestionando); }}>
                                    Simular paso
                                  </Boton>
                                  <Boton variante="secundario" bloque cargando={conexion.isPending && conexion.variables?.id === gestionando.id} onClick={() => conexion.mutate(gestionando)}>
                                    {gestionando.simuladoEnLinea ? 'Desconectar' : 'Reconectar'}
                                  </Boton>
                                </>
                              ) : null}
                              <Boton variante="secundario" bloque iconoInicio={ArrowPathIcon} cargando={sincronizar.isPending && sincronizar.variables?.id === gestionando.id} onClick={() => sincronizar.mutate(gestionando)}>
                                Sincronizar
                              </Boton>
                              <Boton variante="secundario" bloque iconoInicio={KeyIcon} cargando={regenerar.isPending && regenerar.variables?.id === gestionando.id} onClick={() => { setGestionandoId(null); regenerar.mutate(gestionando); }}>
                                {gestionando.tieneSecreto ? 'Nuevo secreto' : 'Generar secreto'}
                              </Boton>
                            </>
                          ) : null}
                          <Boton variante="secundario" bloque iconoInicio={PencilSquareIcon} onClick={() => { setGestionandoId(null); abrir(gestionando); }}>
                            Editar
                          </Boton>
                          <Boton variante="secundario" bloque cargando={activar.isPending && activar.variables?.id === gestionando.id} onClick={() => activar.mutate(gestionando)}>
                            {gestionando.activo ? 'Desactivar' : 'Activar'}
                          </Boton>
                        </div>
        ) : null}
      </Modal>

      <Modal
        abierto={formularioAbierto}
        onCerrar={() => setFormularioAbierto(false)}
        titulo={editando ? 'Editar terminal' : 'Registrar terminal'}
        acciones={
          <>
            <Boton cargando={guardar.isPending} onClick={() => void form.handleSubmit((v) => guardar.mutate(v))()}>
              Guardar
            </Boton>
            <Boton variante="secundario" onClick={() => setFormularioAbierto(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <Campo etiqueta="Nombre" {...form.register('nombre')} error={form.formState.errors.nombre?.message} />
          <Selector etiqueta="Tipo" opciones={TIPOS} {...form.register('tipo')} error={form.formState.errors.tipo?.message} />
          {tipoElegido === 'ZONA' ? (
            <Selector etiqueta="Zona" marcador="Seleccione…" opciones={zonas.map((z) => ({ valor: z.id, texto: z.nombre }))} {...form.register('zonaId')} error={form.formState.errors.zonaId?.message} />
          ) : null}
          <Campo etiqueta="Dirección en la red" {...form.register('ip')} error={form.formState.errors.ip?.message} />
          {guardar.isError ? <Alerta tipo="error">{mensajeDe(guardar.error) ?? 'No se pudo guardar'}</Alerta> : null}
        </div>
      </Modal>

      <Modal
        abierto={secreto !== null}
        onCerrar={() => setSecreto(null)}
        titulo="Secreto del terminal"
        acciones={
          <Boton variante="secundario" onClick={() => setSecreto(null)}>
            Ya lo guardé
          </Boton>
        }
      >
        <div className="space-y-3">
          <Alerta tipo="advertencia">Se muestra una sola vez. Configúrelo en el equipo: con él firma sus eventos de paso.</Alerta>
          <p className="break-all rounded-md bg-gray-100 p-3 font-mono text-sm text-gray-900 dark:bg-white/10 dark:text-white">{secreto}</p>
        </div>
      </Modal>

      <Modal
        abierto={simulando !== null}
        onCerrar={() => setSimulando(null)}
        titulo={`Simular paso por ${simulando?.nombre ?? ''}`}
        acciones={
          <>
            <Boton disabled={!visitaId} cargando={simular.isPending} onClick={() => simular.mutate()}>
              Colocar el dedo
            </Boton>
            <Boton variante="secundario" onClick={() => setSimulando(null)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          {presentes.data?.presentes.length === 0 ? <Alerta tipo="info">No hay visitantes con check-in activo.</Alerta> : null}
          <Selector
            etiqueta="Visitante"
            marcador="Seleccione…"
            value={visitaId}
            onChange={(e) => setVisitaId(e.target.value)}
            opciones={(presentes.data?.presentes ?? []).map((p) => ({ valor: p.visitaId, texto: `${p.visitante.nombreCompleto} · ${p.visitante.empresa}` }))}
          />
          {simular.isError ? <Alerta tipo="error">{mensajeDe(simular.error) ?? 'El terminal rechazó el paso'}</Alerta> : null}
        </div>
      </Modal>
    </div>
  );
}
