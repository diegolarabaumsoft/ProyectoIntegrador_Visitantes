'use client';

import { MapPinIcon, PencilSquareIcon, PlusIcon, NoSymbolIcon } from '@heroicons/react/20/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Cargando } from '@/components/ui/cargando';
import { Casilla } from '@/components/ui/casilla';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { clavesZonas, zonasApi, type Zona } from '@/services/zonas';

const schemaZona = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80, 'Máximo 80 caracteres'),
  esSensible: z.boolean(),
  requiereAcompanante: z.boolean(),
});

type FormZona = z.infer<typeof schemaZona>;

/**
 * AD6 · Zonas de la planta.
 * Adaptado de Tailwind Plus · lists/tables (simple in card) + forms/modals.
 */
export function ListaZonas() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [zonaEditar, setZonaEditar] = useState<Zona | null>(null);
  const [zonaDesactivar, setZonaDesactivar] = useState<Zona | null>(null);
  const [soloActivas, setSoloActivas] = useState(false);

  const notificar = useNotificar();
  const queryClient = useQueryClient();

  const filtros = soloActivas ? { activa: true } : undefined;

  const { data: zonas = [], isPending, error } = useQuery({
    queryKey: clavesZonas.lista(filtros),
    queryFn: () => zonasApi.listar(filtros),
  });

  const form = useForm<FormZona>({
    resolver: zodResolver(schemaZona),
    defaultValues: { nombre: '', esSensible: false, requiereAcompanante: false },
  });

  const abrirCrear = () => {
    setZonaEditar(null);
    form.reset({ nombre: '', esSensible: false, requiereAcompanante: false });
    setModalAbierto(true);
  };

  const abrirEditar = (zona: Zona) => {
    setZonaEditar(zona);
    form.reset({
      nombre: zona.nombre,
      esSensible: zona.esSensible,
      requiereAcompanante: zona.requiereAcompanante,
    });
    setModalAbierto(true);
  };

  const guardarMutacion = useMutation({
    mutationFn: (valores: FormZona) => {
      if (zonaEditar) {
        return zonasApi.actualizar(zonaEditar.id, valores);
      }
      return zonasApi.crear(valores);
    },
    onSuccess: (guardada) => {
      notificar.exito(
        zonaEditar ? 'Zona actualizada' : 'Zona creada',
        `La zona "${guardada.nombre}" se guardó correctamente.`,
      );
      void queryClient.invalidateQueries({ queryKey: clavesZonas.todas });
      setModalAbierto(false);
      form.reset();
    },
    onError: (err) => {
      notificar.error('Error al guardar zona', err instanceof ApiError ? err.message : undefined);
    },
  });

  const desactivarMutacion = useMutation({
    mutationFn: (id: string) => zonasApi.desactivar(id),
    onSuccess: (desactivada) => {
      notificar.exito('Zona desactivada', `La zona "${desactivada.nombre}" quedó inactiva.`);
      void queryClient.invalidateQueries({ queryKey: clavesZonas.todas });
      setZonaDesactivar(null);
    },
    onError: (err) => {
      notificar.error('Error al desactivar', err instanceof ApiError ? err.message : undefined);
    },
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Zonas de la planta"
        descripcion="Catálogo de áreas de la instalación, niveles de seguridad y requisitos de acompañante."
        acciones={
          <Boton iconoInicio={PlusIcon} onClick={abrirCrear}>
            Nueva zona
          </Boton>
        }
      />

      <div className="flex items-center justify-between">
        <Casilla etiqueta="Mostrar solo zonas activas" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {zonas.length} {zonas.length === 1 ? 'zona encontrada' : 'zonas encontradas'}
        </span>
      </div>

      {isPending ? (
        <Cargando texto="Cargando zonas de la planta..." />
      ) : error ? (
        <Alerta tipo="error" titulo="Error al cargar zonas">
          {error instanceof Error ? error.message : 'Error desconocido'}
        </Alerta>
      ) : zonas.length === 0 ? (
        <EstadoVacio
          icono={MapPinIcon}
          titulo="Sin zonas registradas"
          descripcion="No hay zonas configuradas en el sistema."
          accion={
            <Boton variante="secundario" iconoInicio={PlusIcon} onClick={abrirCrear}>
              Crear primera zona
            </Boton>
          }
        />
      ) : (
        <Tabla>
            <Cabecera>
              <Th primera>Nombre</Th>
              <Th>Área sensible</Th>
              <Th>Acompañante obligatorio</Th>
              <Th>Estado</Th>
              <Th ultima>Acciones</Th>
            </Cabecera>
            <Cuerpo>
              {zonas.map((zona) => (
                <tr key={zona.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <Td primera principal>
                    {zona.nombre}
                  </Td>
                  <Td>
                    {zona.esSensible ? (
                      <Insignia color="amarillo">Sensible</Insignia>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Estándar</span>
                    )}
                  </Td>
                  <Td>
                    {zona.requiereAcompanante ? (
                      <Insignia color="indigo">Requiere acompañante</Insignia>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">No</span>
                    )}
                  </Td>
                  <Td>
                    {zona.activa ? (
                      <Insignia color="verde">Activa</Insignia>
                    ) : (
                      <Insignia color="gris">Inactiva</Insignia>
                    )}
                  </Td>
                  <Td ultima>
                    <div className="flex justify-end gap-2">
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        iconoInicio={PencilSquareIcon}
                        onClick={() => abrirEditar(zona)}
                      >
                        Editar
                      </Boton>
                      {zona.activa ? (
                        <Boton
                          tamano="sm"
                          variante="suave"
                          iconoInicio={NoSymbolIcon}
                          onClick={() => setZonaDesactivar(zona)}
                        >
                          Desactivar
                        </Boton>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </Cuerpo>
        </Tabla>
      )}

      {/* Modal Crear / Editar */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo={zonaEditar ? 'Editar zona' : 'Nueva zona'}
        descripcion="Configure las normas de seguridad y acompañamiento que rigen para esta área física."
        acciones={
          <>
            <Boton
              type="submit"
              form="form-zona"
              cargando={guardarMutacion.isPending}
            >
              {zonaEditar ? 'Guardar cambios' : 'Crear zona'}
            </Boton>
            <Boton variante="secundario" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <form
          id="form-zona"
          className="space-y-4"
          onSubmit={form.handleSubmit((valores) => guardarMutacion.mutate(valores))}
        >
          <Campo
            etiqueta="Nombre de la zona"
            placeholder="Ej: Tintorería, Hilatura, Oficinas..."
            error={form.formState.errors.nombre?.message}
            {...form.register('nombre')}
          />
          <div className="pt-2 space-y-3">
            <Casilla
              etiqueta="Área sensible"
              descripcion="Activa protocolos de monitoreo especial y restricciones de permanencia."
              {...form.register('esSensible')}
            />
            <Casilla
              etiqueta="Requiere acompañante obligatorio"
              descripcion="El visitante no puede transitar por esta área sin un acompañante interno asignado."
              {...form.register('requiereAcompanante')}
            />
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Desactivación */}
      <Modal
        abierto={zonaDesactivar !== null}
        onCerrar={() => setZonaDesactivar(null)}
        titulo="Desactivar zona"
        descripcion={`¿Está seguro de desactivar la zona "${zonaDesactivar?.nombre}"? Las nuevas visitas no podrán registrar ingresos a esta área.`}
        icono={ExclamationTriangleIcon}
        tonoIcono="amarillo"
        acciones={
          <>
            <Boton
              variante="peligro"
              cargando={desactivarMutacion.isPending}
              onClick={() => {
                if (zonaDesactivar) desactivarMutacion.mutate(zonaDesactivar.id);
              }}
            >
              Sí, desactivar
            </Boton>
            <Boton variante="secundario" onClick={() => setZonaDesactivar(null)}>
              Cancelar
            </Boton>
          </>
        }
      />
    </div>
  );
}
