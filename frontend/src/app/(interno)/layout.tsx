import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ShellSesion } from '@/components/layout/shell-sesion';
import { COOKIE_ROL } from '@/lib/cookies';
import { esRol } from '@/lib/roles';

/**
 * Layout de las vistas internas (anfitrión, recepción, administración, DPO,
 * seguridad). Lee el rol de la cookie para dibujar la navegación; la
 * autorización real la aplica la API en cada petición.
 */
export default async function LayoutInterno({ children }: LayoutProps<'/'>) {
  const rol = (await cookies()).get(COOKIE_ROL)?.value;
  if (!esRol(rol)) {
    redirect('/login');
  }
  return <ShellSesion rol={rol}>{children}</ShellSesion>;
}
