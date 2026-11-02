'use client';

import { PlusIcon } from '@heroicons/react/20/solid';
import { ExclamationTriangleIcon, UsersIcon } from '@heroicons/react/24/outline';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { NOMBRE_ROL, ROLES, type Rol } from '@/lib/roles';
import { clavesUsuarios, usuariosApi, type Usuario } from '@/services/usuarios';

const schema = z.object({
  nombre: z.string().trim().min(3, 'Indique el nombre completo'),
  correo: z.string().trim().email('El correo no es válido'),
  rol: z.enum(ROLES),
  area: z.string().trim().max(120, 'Máximo 120 caracteres'),
});
type Formulario = z.infer<typeof schema>;

const OPCIONES_ROL = ROLES.map((valor) => ({ valor, texto: NOMBRE_ROL[valor] }));
const VACIO: Formulario = { nombre: '', correo: '', rol: 'ANFITRION', area: '' };
const mensajeDe = (e: unknown) => (e instanceof ApiError ? e.message : undefined);

/** AD3 · Usuarios y roles. Adaptado de Tailwind Plus · lists/tables (simple in card) y overlays/modal-dialogs. */
export function ListaUsuarios() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [rol, setRol] = useState<Rol | ''>('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [desactivando, setDesactivando] = useState<Usuario | null>(null);
  const [restableciendo, setRestableciendo] = useState<Usuario | null>(null);

  const filtros = { rol: rol || undefined, activo: estado === '' ? undefined : estado === 'activo', pagina };
  const { data, isPending, error } = useQuery({ queryKey: clavesUsuarios.lista(filtros), queryFn: () => usuariosApi.listar(filtros) });
  const form = useForm<Formulario>({ resolver: zodResolver(schema), defaultValues: VACIO });
  const rolElegido = useWatch({ control: form.control, name: 'rol' });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clavesUsuarios.todas });

  const abrir = (usuario: Usuario | null) => {
    setEditando(usuario);
    guardar.reset();
    form.reset(usuario ? { nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol, area: usuario.area ?? '' } : VACIO);
    setFormAbierto(true);
  };

  const avisarCorreo = (enviado: boolean, titulo: string) => {
    if (enviado) notificar.exito(titulo, 'La contraseña temporal se envió por correo.');
    else notificar.advertencia(titulo, 'No se pudo enviar el correo. Use «Nueva contraseña» para reintentar.');
  };

  const guardar = useMutation({
    mutationFn: async ({ area, ...v }: Formulario) => {
      const datos = { ...v, ...(v.rol === 'ANFITRION' ? { area } : {}) };
      if (editando) return { ...(await usuariosApi.actualizar(editando.id, datos)), correoEnviado: null };
      return usuariosApi.crear(datos);
    },
    onSuccess: (r) => {
      refrescar();
      setFormAbierto(false);
      if (r.correoEnviado === null) notificar.exito('Usuario actualizado');
      else avisarCorreo(r.correoEnviado, 'Usuario creado');
    },
  });

  const accion = useMutation({
    mutationFn: ({ tipo, id }: { tipo: 'desactivar' | 'reactivar' | 'desbloquear'; id: string }) => usuariosApi[tipo](id),
    onSuccess: (_, { tipo }) => {
      refrescar();
      setDesactivando(null);
      notificar.exito({ desactivar: 'Usuario desactivado', reactivar: 'Usuario reactivado', desbloquear: 'Usuario desbloqueado' }[tipo]);
    },
    onError: (e) => notificar.error('No se pudo completar la acción', mensajeDe(e)),
  });

  const restablecer = useMutation({
    mutationFn: (id: string) => usuariosApi.restablecer(id),
    onSuccess: (r) => {
      refrescar();
      setRestableciendo(null);
      avisarCorreo(r.correoEnviado, 'Contraseña restablecida');
    },
    onError: (e) => notificar.error('No se pudo restablecer la contraseña', mensajeDe(e)),
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Usuarios y roles"
        descripcion="Cada usuario tiene exactamente un rol activo."
        acciones={
          <Boton iconoInicio={PlusIcon} onClick={() => abrir(null)}>
            Nuevo usuario
          </Boton>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Selector
          etiqueta="Rol"
          marcador="Todos"
          opciones={OPCIONES_ROL}
          value={rol}
          onChange={(e) => {
            setRol(e.target.value as Rol | '');
            setPagina(1);
          }}
        />
        <Selector
          etiqueta="Estado"
          marcador="Todos"
          opciones={[
            { valor: 'activo', texto: 'Activos' },
            { valor: 'inactivo', texto: 'Inactivos' },
          ]}
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPagina(1);
          }}
        />
      </div>

      {error ? <Alerta tipo="error" titulo="No se pudieron cargar los usuarios">{mensajeDe(error)}</Alerta> : null}
      {isPending ? <Esqueleto lineas={5} /> : null}
      {data?.datos.length === 0 ? <EstadoVacio icono={UsersIcon} titulo="Sin usuarios" descripcion="Ningún usuario coincide con los filtros." /> : null}
      {data && data.datos.length > 0 ? (
        <>
          <Tabla>
            <Cabecera>
              <Th primera>Usuario</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th ultima>Acciones</Th>
            </Cabecera>
            <Cuerpo>
              {data.datos.map((u) => {
                const bloqueado = u.bloqueadoHasta !== null && new Date(u.bloqueadoHasta) > new Date();
                return (
                  <tr key={u.id}>
                    <Td primera principal>
                      {u.nombre}
                      <span className="block font-normal text-gray-500 dark:text-gray-400">{u.correo}</span>
                    </Td>
                    <Td>
                      {NOMBRE_ROL[u.rol]}
                      {u.area ? <span className="block text-xs text-gray-500 dark:text-gray-400">{u.area}</span> : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {u.activo ? <Insignia color="verde">Activo</Insignia> : <Insignia color="gris">Inactivo</Insignia>}
                        {bloqueado ? <Insignia color="rojo">Bloqueado</Insignia> : null}
                      </div>
                    </Td>
                    <Td ultima>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Boton variante="secundario" tamano="sm" onClick={() => abrir(u)}>
                          Editar
                        </Boton>
                        <Boton variante="secundario" tamano="sm" disabled={restablecer.isPending || !u.activo} onClick={() => setRestableciendo(u)}>
                          Nueva contraseña
                        </Boton>
                        {bloqueado ? (
                          <Boton variante="secundario" tamano="sm" onClick={() => accion.mutate({ tipo: 'desbloquear', id: u.id })}>
                            Desbloquear
                          </Boton>
                        ) : null}
                        {u.activo ? (
                          <Boton variante="suave" tamano="sm" onClick={() => setDesactivando(u)}>
                            Desactivar
                          </Boton>
                        ) : (
                          <Boton variante="suave" tamano="sm" onClick={() => accion.mutate({ tipo: 'reactivar', id: u.id })}>
                            Reactivar
                          </Boton>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Cuerpo>
          </Tabla>
          <nav className="flex items-center justify-between">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Página {data.pagina} de {data.totalPaginas} · {data.total} usuarios
            </p>
            <div className="flex gap-3">
              <Boton variante="secundario" tamano="md" disabled={data.pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </Boton>
              <Boton variante="secundario" tamano="md" disabled={data.pagina >= data.totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                Siguiente
              </Boton>
            </div>
          </nav>
        </>
      ) : null}

      <Modal
        abierto={formAbierto}
        onCerrar={() => setFormAbierto(false)}
        titulo={editando ? 'Editar usuario' : 'Nuevo usuario'}
        descripcion={editando ? undefined : 'Recibirá una contraseña temporal por correo.'}
        acciones={
          <>
            <Boton type="submit" form="form-usuario" cargando={guardar.isPending}>
              {editando ? 'Guardar cambios' : 'Crear usuario'}
            </Boton>
            <Boton variante="secundario" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Boton>
          </>
        }
      >
        <form id="form-usuario" className="space-y-4" onSubmit={form.handleSubmit((v) => guardar.mutate(v))}>
          <Campo etiqueta="Nombre" {...form.register('nombre')} error={form.formState.errors.nombre?.message} />
          <Campo etiqueta="Correo" type="email" {...form.register('correo')} error={form.formState.errors.correo?.message} />
          <Selector etiqueta="Rol" opciones={OPCIONES_ROL} {...form.register('rol')} error={form.formState.errors.rol?.message} />
          {rolElegido === 'ANFITRION' ? <Campo etiqueta="Área" {...form.register('area')} error={form.formState.errors.area?.message} /> : null}
          {guardar.isError ? <Alerta tipo="error">{mensajeDe(guardar.error) ?? 'No se pudo guardar el usuario'}</Alerta> : null}
        </form>
      </Modal>

      <Modal
        abierto={restableciendo !== null}
        onCerrar={() => setRestableciendo(null)}
        titulo="Enviar nueva contraseña"
        descripcion={`La contraseña actual de ${restableciendo?.nombre ?? ''} dejará de funcionar y sus sesiones se cerrarán. Recibirá una nueva por correo.`}
        icono={ExclamationTriangleIcon}
        tonoIcono="amarillo"
        acciones={
          <>
            <Boton variante="peligro" cargando={restablecer.isPending} onClick={() => restableciendo && restablecer.mutate(restableciendo.id)}>
              Sí, enviar
            </Boton>
            <Boton variante="secundario" onClick={() => setRestableciendo(null)}>
              Cancelar
            </Boton>
          </>
        }
      />

      <Modal
        abierto={desactivando !== null}
        onCerrar={() => setDesactivando(null)}
        titulo="Desactivar usuario"
        descripcion={`${desactivando?.nombre ?? ''} no podrá iniciar sesión y sus sesiones abiertas se cerrarán. Su histórico se conserva.`}
        icono={ExclamationTriangleIcon}
        tonoIcono="amarillo"
        acciones={
          <>
            <Boton variante="peligro" cargando={accion.isPending} onClick={() => desactivando && accion.mutate({ tipo: 'desactivar', id: desactivando.id })}>
              Sí, desactivar
            </Boton>
            <Boton variante="secundario" onClick={() => setDesactivando(null)}>
              Cancelar
            </Boton>
          </>
        }
      />
    </div>
  );
}
