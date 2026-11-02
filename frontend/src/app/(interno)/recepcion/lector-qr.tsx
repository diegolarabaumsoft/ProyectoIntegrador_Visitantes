'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

/**
 * El lector USB se comporta como un teclado que termina en Enter: este input
 * visualmente oculto conserva el foco para capturarlo.
 */
export function LectorQr({ onLectura }: { onLectura: (codigo: string) => void }) {
  const lector = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState('');

  // Recupera el foco si se pierde, salvo que el operador esté escribiendo en un campo
  useEffect(() => {
    const enfocar = () => {
      const activo = document.activeElement;
      if (!activo?.matches('input, select, textarea') && !activo?.closest('[role="dialog"]')) lector.current?.focus();
    };
    enfocar();
    const intervalo = window.setInterval(enfocar, 500);
    return () => window.clearInterval(intervalo);
  }, []);

  // El lector escribe en ráfaga: una entrada sin Enter es una tecla suelta o una lectura cortada
  useEffect(() => {
    if (!codigo) return;
    const limpieza = window.setTimeout(() => setCodigo(''), 1000);
    return () => window.clearTimeout(limpieza);
  }, [codigo]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const valor = codigo.trim();
    setCodigo('');
    if (valor) onLectura(valor);
  };

  return (
    <form onSubmit={enviar}>
      <input ref={lector} aria-label="Código leído por el escáner" autoComplete="off" className="sr-only" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
    </form>
  );
}
