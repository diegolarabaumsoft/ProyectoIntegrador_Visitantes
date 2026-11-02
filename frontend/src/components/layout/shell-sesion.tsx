'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ShellInterno } from '@/components/layout/shell-interno';
import { apiGet, apiPost } from '@/lib/api';
import type { Rol } from '@/lib/roles';
import type { UsuarioAutenticado } from '@/types/api';

const RUTA_CONTRASENA = '/cuenta/contrasena';

/**
 * Conecta el shell con la sesión: obtiene el usuario autenticado para la
 * cabecera y cierra sesión contra la API. El endpoint /auth/me se habilita
 * en el Sprint 1; mientras no exista, el shell muestra el rol.
 */
export function ShellSesion({ rol, children }: { rol: Rol; children: ReactNode }) {
  const { data: usuario } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<UsuarioAutenticado>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  // La API rechaza todo lo demás mientras la contraseña sea temporal
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (usuario?.debeCambiarContrasena && pathname !== RUTA_CONTRASENA) router.replace(RUTA_CONTRASENA);
  }, [usuario, pathname, router]);

  async function cerrarSesion() {
    try {
      await apiPost('/auth/logout');
    } finally {
      window.location.assign(new URL('/login', window.location.origin).toString());
    }
  }

  return (
    <ShellInterno rol={rol} nombreUsuario={usuario?.nombre} onCerrarSesion={cerrarSesion}>
      {children}
    </ShellInterno>
  );
}
