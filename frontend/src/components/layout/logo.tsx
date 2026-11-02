import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Marca del VMS (sustituye el logotipo de ejemplo del catálogo). */
export function Logo({ href = '/', compacto = false, className }: { href?: string; compacto?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2.5', className)}>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white dark:bg-indigo-500">
        V
      </span>
      {!compacto ? (
        <span className="text-sm/6 font-semibold text-gray-900 dark:text-white">
          VMS <span className="font-normal text-gray-500 dark:text-gray-400">· Planta Textil</span>
        </span>
      ) : null}
    </Link>
  );
}
