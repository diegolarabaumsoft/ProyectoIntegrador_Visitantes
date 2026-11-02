import { redirect } from 'next/navigation';

/** La raíz siempre redirige: proxy.ts decide entre /login y la ruta del rol. */
export default function Inicio() {
  redirect('/login');
}
