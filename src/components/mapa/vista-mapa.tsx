'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FichaMapa, TOPES } from '@/components/mapa/ficha-mapa'
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

type Colocando = {
  farmId: string
  lat: number
  lon: number
  nombreFinca: string
  /** La finca no está ubicada: no hay adónde volar, se coloca donde se esté. */
  sinPunto?: boolean
}

export function VistaMapa({
  marcadores,
  sinUbicar,
  puntoInicial,
  colocarEnFinca,
  pozoAEditar,
  borrador,
}: {
  marcadores: MarcadorMapa[]
  sinUbicar: number
  /** Id de finca o pozo con el que abrir el mapa ya encuadrado. */
  puntoInicial?: string
  /** Si viene, el mapa abre directo en modo colocación para esa finca. */
  colocarEnFinca?: string
  /** Si la colocación es para corregir un pozo existente, su id. */
  pozoAEditar?: string
  /** Lo que el usuario ya había escrito en el formulario, para devolvérselo. */
  borrador?: Record<string, string>
}) {
  const router = useRouter()
  const [seleccionado, setSeleccionado] = useState<MarcadorMapa | undefined>(() =>
    marcadores.find((m) => m.id === puntoInicial),
  )
  const [colocando, setColocando] = useState<Colocando | undefined>(() => {
    if (!colocarEnFinca) return undefined

    // La finca puede no estar todavía en el mapa (sin coordenadas propias).
    // En ese caso se coloca desde donde haya quedado la vista, que es mejor
    // que mandarlo al medio de la nada.
    const finca = marcadores.find((m) => m.id === colocarEnFinca)

    return {
      farmId: colocarEnFinca,
      lat: finca?.lat ?? 0,
      lon: finca?.lon ?? 0,
      nombreFinca: finca?.nombre ?? 'la finca',
      sinPunto: finca === undefined,
    }
  })

  // El tope al que está abierta la ficha. Vive acá y no adentro de ella
  // porque el mapa lo necesita: es cuánta pantalla tiene que descontar para
  // que el punto elegido no quede debajo.
  const [tope, setTope] = useState<number | string | null>(TOPES[0]!)

  // Cada punto nuevo vuelve a abrir en el tope chico: se toca un pozo para
  // ver de qué se trata, no para que la ficha tape el mapa. El reajuste va
  // durante el render y no en un efecto — es estado derivado, y en un efecto
  // encadenaría un render de más por cada punto que se toca.
  const [idPrevio, setIdPrevio] = useState(seleccionado?.id)
  if (seleccionado?.id !== idPrevio) {
    setIdPrevio(seleccionado?.id)
    if (seleccionado) setTope(TOPES[0]!)
  }

  return (
    <div className="relative h-full w-full">
      <Mapa
        marcadores={marcadores}
        seleccionado={seleccionado}
        onSeleccion={setSeleccionado}
        irAMiUbicacion={puntoInicial === undefined}
        altoFicha={seleccionado && typeof tope === 'number' ? tope : 0}
        colocando={colocando}
        onCancelarColocacion={() => setColocando(undefined)}
        onColocar={(lat, lon) => {
          // Las coordenadas viajan en la URL y el formulario las levanta ya
          // cargadas. Se redondea a 7 decimales, que es lo que guarda la
          // columna: mandar 15 dígitos sería fingir una precisión que no
          // existe ni en el GPS ni en la base.
          const params = new URLSearchParams({
            ...borrador,
            lat: lat.toFixed(7),
            lon: lon.toFixed(7),
          })
          const destino = pozoAEditar
            ? `/fincas/${colocando!.farmId}/pozos/${pozoAEditar}/editar`
            : `/fincas/${colocando!.farmId}/pozos/nuevo`

          router.push(`${destino}?${params}`)
        }}
      />

      {/* Lo que falta marcar se dice, no se omite: un mapa al que le faltan
          pozos y no lo aclara se lee como un mapa completo. Se calla mientras
          se coloca un punto, que es cuando estorbaría la barra de confirmar.
          El margen derecho le deja lugar a la atribución de MapTiler, que va
          en esa esquina y no se puede tapar. */}
      {sinUbicar > 0 && !colocando ? (
        <p className="bg-card/90 text-muted-foreground pointer-events-none absolute right-12 bottom-3 left-3 z-20 rounded-md border px-3 py-2 text-center text-xs shadow-md backdrop-blur">
          {sinUbicar === 1
            ? 'Falta ubicar 1 registro con GPS.'
            : `Faltan ubicar ${sinUbicar} registros con GPS.`}
        </p>
      ) : null}

      <FichaMapa
        marcador={seleccionado}
        onCerrar={() => setSeleccionado(undefined)}
        tope={tope}
        onTope={setTope}
        onColocarPozo={(finca) => {
          // La ficha se cierra: el mapa tiene que quedar entero para apuntar.
          setSeleccionado(undefined)
          setColocando(finca)
        }}
      />
    </div>
  )
}
