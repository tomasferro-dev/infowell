'use client'

import { ImageOff } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Imagen con esqueleto mientras baja, y aviso si falla.
 *
 * Las fotos de los remitos se piden por una ruta protegida que primero valida
 * el permiso y después redirige a una URL firmada. Ese rodeo hace que tarden
 * más que una imagen común, y hasta ahora ese tiempo era un rectángulo en
 * blanco: no se distinguía "está cargando" de "esta foto no existe".
 *
 * No se usa next/image porque no sabe seguir el redirect firmado.
 */
export function ImagenConCarga({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'error'>('cargando')

  if (estado === 'error') {
    return (
      <div
        role="img"
        aria-label={`${alt} (no se pudo cargar)`}
        className={cn(
          'bg-muted text-muted-foreground flex size-full flex-col items-center justify-center gap-1',
          className,
        )}
      >
        <ImageOff className="size-5" />
        <span className="text-[10px]">No se pudo cargar</span>
      </div>
    )
  }

  return (
    <span className="relative block size-full">
      {estado === 'cargando' ? (
        <span aria-hidden className="bg-muted absolute inset-0 animate-pulse" />
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element -- ruta protegida con redirect firmado */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setEstado('lista')}
        onError={() => setEstado('error')}
        className={cn(
          'size-full transition-opacity duration-200',
          estado === 'lista' ? 'opacity-100' : 'opacity-0',
          className,
        )}
      />
    </span>
  )
}
