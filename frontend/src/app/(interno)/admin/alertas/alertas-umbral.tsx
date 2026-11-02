'use client';

import { PlusIcon } from '@heroicons/react/20/solid';
import { BellAlertIcon } from '@heroicons/react/24/outline';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Esqueleto } from '@/components/ui/cargando';
import { EncabezadoPagina } from '@/components/ui/encabezado-pagina';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { Insignia } from '@/components/ui/insignia';
import { Modal } from '@/components/ui/modal';
import { useNotificar } from '@/components/ui/notificaciones';
import { Cabecera, Cuerpo, Tabla, Td, Th } from '@/components/ui/tabla';
import { ApiError } from '@/lib/api';
import { clavesKpi, kpiApi, NOMBRE_INDICADOR, type NombreIndicador } from '@/services/kpi';

const INDICADORES = (Object.keys(NOMBRE_INDICADOR) as NombreIndicador[]).map((valor) => ({ valor, texto: NOMBRE_INDICADOR[valor] }));
const schema = z.object({
  indicador: z.string().min(1),
  operador: z.enum(['MAYOR', 'MENOR']),
  umbral: z.string().trim().min(1, 'Indique un número').refine((v) => Number.isFinite(Number(v)), 'Indique un número').transform(Number),
  destinatarios: z.string().refine((v) => v.split(',').map((d) => d.trim()).filter(Boolean).every((d) => z.email().safeParse(d).success) && v.trim().length > 0, 'Indique correos válidos separados por coma'),
});
type Entrada = z.input<typeof schema>;
type Salida = z.output<typeof schema>;
const mensajeDe = (e: unknown) => (e instanceof ApiError ? e.message : undefined);

/** AD5 · Alertas por umbral. Adaptado de Tailwind Plus · lists/tables y overlays/modal-dialogs. */
export function AlertasUmbral() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [abierto, setAbierto] = useState(false);
  const { data, isPending, error } = useQuery({ queryKey: clavesKpi.alertas, queryFn: kpiApi.alertas });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(schema),
    defaultValues: { indicador: 'TIEMPO_CHECKIN_PROMEDIO', operador: 'MAYOR', umbral: '180', destinatarios: '' },
  });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clavesKpi.alertas });

  const crear = useMutation({
    mutationFn: (v: Salida) => kpiApi.crearAlerta({ indicador: v.indicador as NombreIndicador, operador: v.operador, umbral: v.umbral, destinatarios: v.destinatarios.split(',').map((d) => d.trim()).filter(Boolean) }),
    onSuccess: () => {
      refrescar();
      setAbierto(false);
      reset();
      notificar.exito('Alerta creada');
    },
  });
  const alternar = useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) => kpiApi.actualizarAlerta(id, { activa }),
    onSuccess: refrescar,
    onError: (e) => notificar.error('No se pudo actualizar', mensajeDe(e)),
  });
  const eliminar = useMutation({
    mutationFn: kpiApi.eliminarAlerta,
    onSuccess: refrescar,
    onError: (e) => notificar.error('No se pudo eliminar', mensajeDe(e)),
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Alertas por umbral"
        descripcion="Se evalúan cada día a las 6:00 a. m. con los indicadores del día anterior."
        acciones={
          <Boton iconoInicio={PlusIcon} onClick={() => { crear.reset(); setAbierto(true); }}>
            Nueva alerta
          </Boton>
        }
      />
      {error ? <Alerta tipo="error" titulo="No se pudieron cargar las alertas">{mensajeDe(error)}</Alerta> : null}
      {isPending ? <Esqueleto lineas={4} /> : null}
      {data?.length === 0 ? <EstadoVacio icono={BellAlertIcon} titulo="Sin alertas configuradas" /> : null}
      {data && data.length > 0 ? (
        <Tabla>
          <Cabecera>
            <Th primera>Indicador</Th>
            <Th>Condición</Th>
            <Th>Destinatarios</Th>
            <Th>Estado</Th>
            <Th ultima>Acciones</Th>
          </Cabecera>
          <Cuerpo>
            {data.map((a) => (
              <tr key={a.id}>
                <Td primera principal>
                  {NOMBRE_INDICADOR[a.indicador]}
                </Td>
                <Td>
                  {a.operador === 'MAYOR' ? 'Mayor que' : 'Menor que'} {a.umbral}
                </Td>
                <Td className="whitespace-normal">{a.destinatarios.join(', ')}</Td>
                <Td>{a.activa ? <Insignia color="verde">Activa</Insignia> : <Insignia color="gris">Inactiva</Insignia>}</Td>
                <Td ultima>
                  <div className="flex justify-end gap-2">
                    <Boton variante="secundario" tamano="sm" onClick={() => alternar.mutate({ id: a.id, activa: !a.activa })}>
                      {a.activa ? 'Desactivar' : 'Activar'}
                    </Boton>
                    <Boton variante="suave" tamano="sm" onClick={() => eliminar.mutate(a.id)}>
                      Eliminar
                    </Boton>
                  </div>
                </Td>
              </tr>
            ))}
          </Cuerpo>
        </Tabla>
      ) : null}
      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Nueva alerta"
        acciones={
          <>
            <Boton type="submit" form="form-alerta" cargando={crear.isPending}>
              Crear alerta
            </Boton>
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <form id="form-alerta" className="space-y-4" onSubmit={handleSubmit((v) => crear.mutate(v))}>
          <Selector etiqueta="Indicador" opciones={INDICADORES} {...register('indicador')} />
          <Selector etiqueta="Condición" opciones={[{ valor: 'MAYOR', texto: 'Mayor que' }, { valor: 'MENOR', texto: 'Menor que' }]} {...register('operador')} />
          <Campo etiqueta="Umbral" type="number" step="any" {...register('umbral')} error={errors.umbral?.message} />
          <Campo etiqueta="Destinatarios" ayuda="Correos separados por coma" {...register('destinatarios')} error={errors.destinatarios?.message} />
          {crear.isError ? <Alerta tipo="error">{mensajeDe(crear.error) ?? 'No se pudo crear la alerta'}</Alerta> : null}
        </form>
      </Modal>
    </div>
  );
}
