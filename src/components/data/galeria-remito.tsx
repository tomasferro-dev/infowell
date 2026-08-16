'use client'

import { useState } from 'react'

import { VisorImagenes } from '@/components/data/visor-imagenes'

export type FotoRemito = { id: string; storagePath: string }

/**
 * Miniaturas con visor a pantalla completa.
 *
 * Las imágenes se piden por la ruta protegida, no por una URL de Storage: el
 * permiso se revalida en cada request. Por eso tampoco se usa next/image, que
 * no sabe seguir el redirect firmado.
 */
export function GaleriaRemito({
  fotos,
  columnas = 3,
}: {
  fotos: FotoRemito[]
  /** 3 en el listado (miniaturas), 2 en el detalle (se ven mejor). */
  columnas?: 2 | 3
}) {
  const [indice, setIndice] = useState<number>()

  if (fotos.length === 0) return null

  const imagenes = fotos.map((foto, i) => ({
    id: foto.id,
    src: `/api/files/remitos/${foto.storagePath}`,
    alt: `Foto ${i + 1} del remito`,
  }))

  return (
    <>
      <ul className={columnas === 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
        {imagenes.map((imagen, i) => (
          <li key={imagen.id}>
            <button
              type="button"
              onClick={() => setIndice(i)}
              aria-label={`Ampliar foto ${i + 1} de ${fotos.length}`}
              className="aspect-square w-full overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ruta protegida con redirect firmado */}
              <img
                src={imagen.src}
                alt={imagen.alt}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {indice !== undefined ? (
        <VisorImagenes
          imagenes={imagenes}
          indiceInicial={indice}
          onCerrar={() => setIndice(undefined)}
        />
      ) : null}
    </>
  )
}
