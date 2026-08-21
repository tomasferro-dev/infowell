import { ChevronLeft, MapPinOff } from 'lucide-react'
import Link from 'next/link'

import { VistaMapa } from '@/components/mapa/vista-mapa'
import { Button } from '@/components/ui/button'
import { puntosDelMapa } from '@/server/queries/farms'

export const metadata = { title: 'Mapa' }

export default async function MapaPage() {
  // El acotamiento vive en la query: un CLIENTE solo recibe sus fincas.
  const { marcadores, pozosSinUbicar, fincasSinUbicar } = await puntosDelMapa()

  const sinUbicar = pozosSinUbicar + fincasSinUbicar

  return (
    /* Se sale del contenedor del layout: el mapa ocupa la pantalla entera
       menos el encabezado y la barra de navegación. */
    <div className="fixed inset-x-0 top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10">
      <div className="absolute inset-0">
        {marcadores.length > 0 ? (
          <VistaMapa marcadores={marcadores} />
        ) : (
          <div className="bg-muted/30 flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <MapPinOff className="text-muted-foreground size-8" />
            <div>
              <p className="font-medium">Todavía no hay nada ubicado</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Las fincas y los pozos aparecen acá cuando alguien los marca con el GPS estando
                en el lugar.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/fincas">Ir a las fincas</Link>
            </Button>
          </div>
        )}
      </div>

      {/* Vuelta atrás flotando sobre la imagen: el encabezado no se ve acá. */}
      <Button
        asChild
        size="sm"
        variant="secondary"
        className="absolute top-3 left-3 z-20 shadow-md"
      >
        <Link href="/">
          <ChevronLeft className="size-4" />
          Volver
        </Link>
      </Button>

      {/* Lo que falta marcar se dice, no se omite: un mapa al que le faltan
          pozos y no lo aclara se lee como un mapa completo. */}
      {sinUbicar > 0 ? (
        <p className="bg-card/90 text-muted-foreground absolute inset-x-3 bottom-3 z-20 rounded-md border px-3 py-2 text-center text-xs shadow-md backdrop-blur">
          {sinUbicar === 1
            ? 'Falta ubicar 1 registro con GPS.'
            : `Faltan ubicar ${sinUbicar} registros con GPS.`}
        </p>
      ) : null}
    </div>
  )
}
