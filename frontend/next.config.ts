import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache Components se deja desactivado en esta etapa: las vistas internas
  // dependen de la sesión (cookies) y de datos en tiempo real que se obtienen
  // en el cliente con TanStack Query. Se evaluará activarlo en el Sprint 4.
  cacheComponents: false,
  partialPrefetching: false,
};

export default nextConfig;
