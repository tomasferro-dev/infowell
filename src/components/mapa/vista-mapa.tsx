'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { FichaMapa } from '@/components/mapa/ficha-mapa'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarcadorMapa } from '@/server/queries/farms'

/**
 * maplibre-gl solo existe en el cliente (toca window y WebGL al importarse) y
 * pesa lo suyo, así que entra por dynamic con ssr apagado. Mientras baja se
 * muestra un esqueleto, no una pantalla en blanco.
 */
const Mapa = dynamic(() => import('@/components/mapa/mapa').then((m) => m.Mapa), {
  ssr: false,
  loading: () => (
    <div className="relative h-full w-full">
      <Skeleton className="h-full w-full rounded-none" />
      <p
        role="status"
        className="text-muted-foreground absolute inset-x-0 bottom-6 text-center text-sm"
      >
        Cargando el mapa…
      </p>
    </div>
  ),
})

export function VistaMapa({ marcadores }: { marcadores: MarcadorMapa[] }) {
  const [seleccionado, setSeleccionado] = useState<MarcadorMapa>()

  return (
    <>
      <Mapa
        marcadores={marcadores}
        seleccionado={seleccionado}
        onSeleccion={setSeleccionado}
      />
      <FichaMapa marcador={seleccionado} onCerrar={() => setSeleccionado(undefined)} />
    </>
  )
}
