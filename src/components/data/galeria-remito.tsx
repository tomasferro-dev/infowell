'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

export type FotoRemito = { id: string; storagePath: string }

/**
 * Miniaturas con lightbox al tocar.
 *
 * Las imágenes se piden por la ruta protegida, no por una URL de Storage: el
 * permiso se revalida en cada request. Por eso tampoco se usa next/image, que
 * no sabe seguir el redirect firmado.
 */
export function GaleriaRemito({ fotos }: { fotos: FotoRemito[] }) {
  const [indice, setIndice] = useState<number>()

  useEffect(() => {
    if (indice === undefined) return

    function alTeclado(e: KeyboardEvent) {
      if (e.key === 'Escape') setIndice(undefined)
      if (e.key === 'ArrowRight') setIndice((i) => (i === undefined ? i : (i + 1) % fotos.length))
      if (e.key === 'ArrowLeft')
        setIndice((i) => (i === undefined ? i : (i - 1 + fotos.length) % fotos.length))
    }

    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [indice, fotos.length])

  if (fotos.length === 0) return null

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((foto, i) => (
          <li key={foto.id}>
            <button
              type="button"
              onClick={() => setIndice(i)}
              aria-label={`Ampliar foto ${i + 1} de ${fotos.length}`}
              className="aspect-square w-full overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ruta protegida con redirect firmado, next/image no la resuelve */}
              <img
                src={`/api/files/remitos/${foto.storagePath}`}
                alt={`Foto ${i + 1} del remito`}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {indice !== undefined ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${indice + 1} de ${fotos.length}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIndice(undefined)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ídem */}
          <img
            src={`/api/files/remitos/${fotos[indice]!.storagePath}`}
            alt={`Foto ${indice + 1} del remito, ampliada`}
            className="max-h-full max-w-full object-contain"
          />

          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => setIndice(undefined)}
            aria-label="Cerrar"
            className="absolute top-4 right-4"
          >
            <X className="size-4" />
          </Button>

          {fotos.length > 1 ? (
            <p className="absolute bottom-6 text-sm text-white/80 tabular-nums">
              {indice + 1} / {fotos.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
