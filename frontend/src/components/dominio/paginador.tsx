import { Boton } from '@/components/ui/boton';

/** Adaptado de Tailwind Plus · navigation/pagination (simple card footer). */
export function Paginador({ pagina, totalPaginas, total, unidad, onCambiar }: { pagina: number; totalPaginas: number; total: number; unidad: string; onCambiar: (pagina: number) => void }) {
  return (
    <nav className="flex items-center justify-between">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Página {pagina} de {totalPaginas} · {total} {unidad}
      </p>
      <div className="flex gap-3">
        <Boton variante="secundario" tamano="md" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
          Anterior
        </Boton>
        <Boton variante="secundario" tamano="md" disabled={pagina >= totalPaginas} onClick={() => onCambiar(pagina + 1)}>
          Siguiente
        </Boton>
      </div>
    </nav>
  );
}
