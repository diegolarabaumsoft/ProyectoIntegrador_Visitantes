import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases de Tailwind resolviendo conflictos (la última gana). */
export function cn(...entradas: ClassValue[]) {
  return twMerge(clsx(entradas));
}
