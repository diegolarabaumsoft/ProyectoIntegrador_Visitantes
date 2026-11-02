import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_ACCESO, COOKIE_ROL } from '@/lib/cookies';
import { esRol, RUTA_INICIO, rutaPermitida } from '@/lib/roles';

/**
 * Protección optimista de rutas por rol (Next.js 16 usa `proxy.ts` en lugar
 * de `middleware.ts`). La autorización real la hace la API en cada petición
 * (RNF-07); aquí solo se evita mostrar pantallas que el rol no puede usar.
 */
const RUTAS_PUBLICAS = ['/login', '/pre-registro', '/restablecer'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tieneSesion = Boolean(request.cookies.get(COOKIE_ACCESO)?.value);
  const rolCookie = request.cookies.get(COOKIE_ROL)?.value;
  const rol = esRol(rolCookie) ? rolCookie : null;

  const esPublica = RUTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (pathname === '/') {
    return NextResponse.redirect(new URL(tieneSesion && rol ? RUTA_INICIO[rol] : '/login', request.url));
  }

  if (esPublica) {
    if (pathname === '/login' && tieneSesion && rol) {
      return NextResponse.redirect(new URL(RUTA_INICIO[rol], request.url));
    }
    return NextResponse.next();
  }

  if (!tieneSesion || !rol) {
    const destino = new URL('/login', request.url);
    destino.searchParams.set('volverA', pathname);
    return NextResponse.redirect(destino);
  }

  if (!rutaPermitida(rol, pathname)) {
    return NextResponse.redirect(new URL(RUTA_INICIO[rol], request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Excluye archivos estáticos, imágenes y rutas internas de Next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
