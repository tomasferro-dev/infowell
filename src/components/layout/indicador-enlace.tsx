'use client'

import { ChevronRight, Loader2 } from 'lucide-react'
import { useLinkStatus } from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Señal de que un enlace ya fue tocado y la navegación está en curso.
 *
 * Sin esto, entre el toque y el cambio de pantalla no pasa NADA visible. Con
 * una conexión lenta eso son varios segundos en los que el usuario no sabe si
 * el toque se registró, y vuelve a tocar.
 *
 * Los indicadores se renderizan siempre y solo cambian de opacidad: si
 * aparecieran y desaparecieran, moverían el contenido de al lado justo cuando
 * el dedo está encima.
 *
 * Ambos componentes tienen que usarse DENTRO de un <Link>: useLinkStatus lee
 * el estado del enlace que los contiene.
 */

export function IndicadorEnlace({ className }: { className?: string }) {
  const { pending } = useLinkStatus()

  return (
    <Loader2
      aria-hidden
      className={cn(
        'size-4 shrink-0 animate-spin transition-opacity',
        pending ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  )
}

/**
 * Para las filas de una lista: la flecha se convierte en spinner al tocar.
 * Ocupan el mismo lugar, así que el cambio no mueve nada.
 */
export function FlechaOCarga({ className }: { className?: string }) {
  const { pending } = useLinkStatus()

  return (
    <span className={cn('relative size-4 shrink-0', className)}>
      <ChevronRight
        aria-hidden
        className={cn(
          'text-muted-foreground absolute inset-0 size-4 transition-opacity',
          pending ? 'opacity-0' : 'opacity-100',
        )}
      />
      <Loader2
        aria-hidden
        className={cn(
          'text-foreground absolute inset-0 size-4 animate-spin transition-opacity',
          pending ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  )
}
