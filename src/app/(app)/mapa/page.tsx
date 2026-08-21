import { ChevronLeft, MapPinOff } from 'lucide-react'
import Link from 'next/link'

import { VistaMapa } from '@/components/mapa/vista-mapa'
import { Button } from '@/components/ui/button'
import { puntosDelMapa } from '@/server/queries/farms'

export const metadata = { title: 'Mapa' }

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // El acotamiento vive en la query: un CLIENTE solo recibe sus fincas.
  const [{ marcadores, pozosSinUbicar, fincasSinUbicar }, query] = await Promise.all([
    puntosDelMapa(),
    searchParams,
  ])

  /*
   * `?punto=<id>` abre el mapa encuadrado en una finca o un pozo concreto.
   *
   * Es la entrada desde «Ver en el mapa», y resuelve un problema real: a zoom
   * amplio los pines de dos fincas cercanas se pisan y no hay forma de tocar
   * el de atrás. Llegando por acá se entra ya encima del punto buscado.
   *
   * No hace falta validar el id contra nada: se busca dentro de los marcadores
   * que el actor YA puede ver. Un id ajeno simplemente no aparece.
   */
  const punto = typeof query.punto === 'string' ? query.punto : undefined

  /*
   * `?colocar=<farmId>` abre directo en modo colocación, desde el formulario
   * de alta de pozo. Los demás campos vienen de arrastre para no perder lo que
   * el usuario ya había escrito, y vuelven tal cual al formulario.
   *
   * El farmId no se valida contra la base: se usa solo para armar una ruta
   * interna, y esa página tiene su propio guard. Uno inventado termina en un
   * 404, no en un acceso.
   */
  const colocar = typeof query.colocar === 'string' ? query.colocar : undefined
  // Si viene, la colocación es para corregir un pozo que ya existe.
  const pozoAEditar = typeof query.pozo === 'string' ? query.pozo : undefined

  const borrador: Record<string, string> = {}
  for (const campo of ['name', 'code', 'drilledAt', 'notes']) {
    const valor = query[campo]
    if (typeof valor === 'string' && valor !== '') borrador[campo] = valor
  }

  const sinUbicar = pozosSinUbicar + fincasSinUbicar

  return (
    /* Se sale del contenedor del layout: el mapa ocupa la pantalla entera
       menos el encabezado y la barra de navegación. */
    <div className="fixed inset-x-0 top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10">
      <div className="absolute inset-0">
        {marcadores.length > 0 || colocar ? (
          <VistaMapa
            marcadores={marcadores}
            sinUbicar={sinUbicar}
            puntoInicial={punto}
            colocarEnFinca={colocar}
            pozoAEditar={pozoAEditar}
            borrador={borrador}
          />
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
    </div>
  )
}
