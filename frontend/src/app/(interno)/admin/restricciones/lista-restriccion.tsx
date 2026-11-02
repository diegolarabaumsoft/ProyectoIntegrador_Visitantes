'use client';

import { ExclamationTriangleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { AreaTexto, Campo } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import {
  clavesRestricciones,
  restriccionesApi,
  type EntradaRestriccion,
} from '@/services/restricciones';

const schemaCrear = z.object({
  numeroDocumento: z.string().trim().min(3, 'El documento debe tener al menos 3 caracteres'),
  nombreReferencia: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  motivo: z.string().trim().min(3, 'El motivo debe tener al menos 3 caracteres'),
});

const schemaEditar = z.object({
  nombreReferencia: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  motivo: z.string().trim().min(3, 'El motivo debe tener al menos 3 caracteres'),
});

type FormCrear = z.infer<typeof schemaCrear>;
type FormEditar = z.infer<typeof schemaEditar>;

/**
 * AD2 · Lista de restricción.
 * Adaptado de Tailwind Plus · lists/tables (simple in card) + forms/modals.
 */
export function ListaRestriccion() {
  const [busqueda, setBusqueda] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [restriccionEditar, setRestriccionEditar] = useState<EntradaRestriccion | null>(null);
  const [restriccionEliminar, setRestriccionEliminar] = useState<EntradaRestriccion | null>(null);

  const notificar = useNotificar();
  const queryClient = useQueryClient();

  const filtros = { q: busqueda || undefined, activa: true };

  const { data, isPending, error } = useQuery({
    queryKey: clavesRestricciones.lista(filtros),
    queryFn: () => restriccionesApi.listar(filtros),
  });

  const formCrear = useForm<FormCrear>({
    resolver: zodResolver(schemaCrear),
    defaultValues: { numeroDocumento: '', nombreReferencia: '', motivo: '' },
  });

  const formEditar = useForm<FormEditar>({
    resolver: zodResolver(schemaEditar),
    defaultValues: { nombreReferencia: '', motivo: '' },
  });

  const crearMutacion = useMutation({
    mutationFn: (valores: FormCrear) => restriccionesApi.crear(valores),
    onSuccess: (creada) => {
      notificar.exito('Entrada creada', `${creada.nombreReferencia} se agregó a la lista de restricción.`);
      void queryClient.invalidateQueries({ queryKey: clavesRestricciones.todas });
      setModalCrear(false);
      formCrear.reset();
    },
    onError: (err) => {
      notificar.error('No se pudo registrar la restricción', err instanceof ApiError ? err.message : undefined);
    },
  });

  const actualizarMutacion = useMutation({
    mutationFn: ({ id, valores }: { id: string; valores: FormEditar }) =>
      restriccionesApi.actualizar(id, valores),
    onSuccess: (actualizada) => {
      notificar.exito('Entrada actualizada', `Se modificaron los datos de ${actualizada.nombreReferencia}.`);
      void queryClient.invalidateQueries({ queryKey: clavesRestricciones.todas });
      setRestriccionEditar(null);
      formEditar.reset();
    },
    onError: (err) => {
      notificar.error('No se pudo actualizar', err instanceof ApiError ? err.message : undefined);
    },
  });

  const eliminarMutacion = useMutation({
    mutationFn: (id: string) => restriccionesApi.eliminar(id),
    onSuccess: () => {
      notificar.exito('Entrada eliminada', 'La persona fue dada de baja de la lista activa.');
      void queryClient.invalidateQueries({ queryKey: clavesRestricciones.todas });
      setRestriccionEliminar(null);
    },
    onError: (err) => {
      notificar.error('No se pudo eliminar', err instanceof ApiError ? err.message : undefined);
    },
  });

  const abrirEditar = (entrada: EntradaRestriccion) => {
    setRestriccionEditar(entrada);
    formEditar.reset({
      nombreReferencia: entrada.nombreReferencia,
      motivo: entrada.motivo,
    });
  };

  const lista = data?.datos ?? [];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Lista de restricción"
        descripcion="Gestión de personas con ingreso restringido a las instalaciones de la planta."
        acciones={
          <Boton iconoInicio={PlusIcon} onClick={() => setModalCrear(true)}>
            Agregar entrada
          </Boton>
        }
      />

      <Alerta tipo="info">
        Solo el administrador y Seguridad pueden modificarla; cada cambio queda registrado en la bitácora de auditoría.
      </Alerta>

      <div className="max-w-md">
        <Campo
          id="busqueda-restriccion"
          placeholder="Buscar por nombre o motivo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {isPending ? (
        <Cargando texto="Cargando lista de restricción..." />
      ) : error ? (
        <Alerta tipo="error" titulo="Error al cargar restricciones">
          {error instanceof Error ? error.message : 'Error desconocido'}
        </Alerta>
      ) : lista.length === 0 ? (
        <EstadoVacio
          icono={ShieldExclamationIcon}
          titulo="Sin restricciones activas"
          descripcion={busqueda ? 'No se encontraron coincidencias con el término de búsqueda.' : 'No hay personas en la lista de restricción.'}
          accion={
            !busqueda ? (
              <Boton variante="secundario" iconoInicio={PlusIcon} onClick={() => setModalCrear(true)}>
                Agregar primera entrada
              </Boton>
            ) : undefined
          }
        />
      ) : (
        <Tabla>
            <Cabecera>
                <Th>Documento</Th>
                <Th>Nombre de referencia</Th>
                <Th>Motivo</Th>
                <Th>Autor · Fecha</Th>
                <Th className="text-right">Acciones</Th>
            </Cabecera>
            <Cuerpo>
              {lista.map((entrada) => (
                <tr key={entrada.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <Td className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {entrada.numeroDocumento}
                  </Td>
                  <Td className="font-medium text-gray-900 dark:text-white">
                    {entrada.nombreReferencia}
                  </Td>
                  <Td className="max-w-xs truncate text-gray-600 dark:text-gray-300">
                    {entrada.motivo}
                  </Td>
                  <Td className="text-xs text-gray-500 dark:text-gray-400">
                    <div>{entrada.autor.nombre}</div>
                    <div className="text-gray-400 dark:text-gray-500">
                      {formatearFechaHora(entrada.fechaRegistro)}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        iconoInicio={PencilSquareIcon}
                        onClick={() => abrirEditar(entrada)}
                      >
                        Editar
                      </Boton>
                      <Boton
                        tamano="sm"
                        variante="peligro"
                        iconoInicio={TrashIcon}
                        onClick={() => setRestriccionEliminar(entrada)}
                      >
                        Eliminar
                      </Boton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Cuerpo>
        </Tabla>
      )}

      {/* Modal Crear */}
      <Modal
        abierto={modalCrear}
        onCerrar={() => setModalCrear(false)}
        titulo="Agregar a la lista de restricción"
        descripcion="El número de documento se almacenará cifrado y se verificará en cada check-in."
        acciones={
          <>
            <Boton
              type="submit"
              form="form-crear-restriccion"
              cargando={crearMutacion.isPending}
            >
              Guardar restricción
            </Boton>
            <Boton variante="secundario" onClick={() => setModalCrear(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <form
          id="form-crear-restriccion"
          className="space-y-4"
          onSubmit={formCrear.handleSubmit((datos) => crearMutacion.mutate(datos))}
        >
          <Campo
            etiqueta="Número de documento"
            placeholder="Ej: 1020304050"
            error={formCrear.formState.errors.numeroDocumento?.message}
            {...formCrear.register('numeroDocumento')}
          />
          <Campo
            etiqueta="Nombre de referencia"
            placeholder="Ej: Carlos Mendoza"
            error={formCrear.formState.errors.nombreReferencia?.message}
            {...formCrear.register('nombreReferencia')}
          />
          <AreaTexto
            etiqueta="Motivo de la restricción"
            placeholder="Describa la causa de restricción de acceso..."
            rows={3}
            error={formCrear.formState.errors.motivo?.message}
            {...formCrear.register('motivo')}
          />
        </form>
      </Modal>

      {/* Modal Editar */}
      <Modal
        abierto={restriccionEditar !== null}
        onCerrar={() => setRestriccionEditar(null)}
        titulo="Editar restricción"
        descripcion={`Documento: ${restriccionEditar?.numeroDocumento ?? ''}`}
        acciones={
          <>
            <Boton
              type="submit"
              form="form-editar-restriccion"
              cargando={actualizarMutacion.isPending}
            >
              Guardar cambios
            </Boton>
            <Boton variante="secundario" onClick={() => setRestriccionEditar(null)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <form
          id="form-editar-restriccion"
          className="space-y-4"
          onSubmit={formEditar.handleSubmit((datos) => {
            if (!restriccionEditar) return;
            actualizarMutacion.mutate({ id: restriccionEditar.id, valores: datos });
          })}
        >
          <Campo
            etiqueta="Nombre de referencia"
            error={formEditar.formState.errors.nombreReferencia?.message}
            {...formEditar.register('nombreReferencia')}
          />
          <AreaTexto
            etiqueta="Motivo de la restricción"
            rows={3}
            error={formEditar.formState.errors.motivo?.message}
            {...formEditar.register('motivo')}
          />
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        abierto={restriccionEliminar !== null}
        onCerrar={() => setRestriccionEliminar(null)}
        titulo="Eliminar de la lista de restricción"
        descripcion={`¿Está seguro de dar de baja la restricción para ${restriccionEliminar?.nombreReferencia} (${restriccionEliminar?.numeroDocumento})? Esta persona podrá volver a ingresar a la planta.`}
        icono={ExclamationTriangleIcon}
        tonoIcono="rojo"
        acciones={
          <>
            <Boton
              variante="peligro"
              cargando={eliminarMutacion.isPending}
              onClick={() => {
                if (restriccionEliminar) eliminarMutacion.mutate(restriccionEliminar.id);
              }}
            >
              Sí, eliminar
            </Boton>
            <Boton variante="secundario" onClick={() => setRestriccionEliminar(null)}>
              Cancelar
            </Boton>
          </>
        }
      />
    </div>
  );
}
