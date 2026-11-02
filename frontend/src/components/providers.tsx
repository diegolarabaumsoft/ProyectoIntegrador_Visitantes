'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NotificacionesProvider } from '@/components/ui/notificaciones';
import { ApiError } from '@/lib/api';

let clienteNavegador: QueryClient | undefined;

function crearQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (fallos, error) => {
          // No reintentar errores de negocio ni de autorización
          if (error instanceof ApiError && error.statusCode < 500) return false;
          return fallos < 2;
        },
      },
    },
  });
}

function obtenerQueryClient() {
  if (typeof window === 'undefined') return crearQueryClient();
  clienteNavegador ??= crearQueryClient();
  return clienteNavegador;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={obtenerQueryClient()}>
      <NotificacionesProvider>{children}</NotificacionesProvider>
    </QueryClientProvider>
  );
}
