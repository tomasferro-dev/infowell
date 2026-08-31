'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { FichaMapa, TOPES, TOPE_QUE_SIGUE_EL_MAPA } from '@/components/mapa/ficha-mapa'
import { PanelDibujo, type DatosDibujo } from '@/components/mapa/panel-dibujo'
import { esClaveColor, type Forma } from '@/lib/anotaciones'
import { destinoDeColocacion, type ModoColocacion } from '@/lib/colocacion-mapa'
import {
  borrarAnotacionAction,
  guardarAnotacionAction,
} from '@/server/actions/anotaciones'
import type { AnotacionMapa } from '@/server/queries/farms'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarcadorMapa } from '@/server/queries/farms'

/**
 * maplibre-gl solo existe en el cliente (toca window y WebGL al importarse) y
 * pesa lo suyo, así que entra por dynamic con ssr apagado. Mientras baja se
 * muestra un esqueleto, no una pantalla en blanco.
 */
type Dibujando = {
  forma: Forma
  rectangulo: boolean
  farmId: string
  /** Si viene, se está editando un dibujo que ya existe. */
  id?: string
  puntos: [number, number][]
}

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
  modo: ModoColocacion
  farmId?: string
  wellId?: string
  lat: number
  lon: number
  /** Qué se está ubicando, para decírselo al usuario mientras apunta. */
  quePunto: string
  /** No hay punto de partida: se coloca sobre lo que el usuario esté mirando. */
  sinPunto?: boolean
}

export function VistaMapa({
  marcadores,
  anotaciones,
  sinUbicar,
  puntoInicial,
  modo,
  fincaAColocar,
  pozoAColocar,
  borrador,
}: {
  marcadores: MarcadorMapa[]
  anotaciones: AnotacionMapa[]
  sinUbicar: number
  /** Id de finca o pozo con el que abrir el mapa ya encuadrado. */
  puntoInicial?: string
  /** Si viene, el mapa abre directo en modo colocación. */
  modo?: ModoColocacion
  /** La finca: dueña del pozo que se coloca, o la que se está editando. */
  fincaAColocar?: string
  /** Si se está corrigiendo un pozo que ya existe, su id. */
  pozoAColocar?: string
  /** Lo que el usuario ya había escrito en el formulario, para devolvérselo. */
  borrador?: Record<string, string>
}) {
  const router = useRouter()
  const [seleccionado, setSeleccionado] = useState<MarcadorMapa | undefined>(() =>
    marcadores.find((m) => m.id === puntoInicial),
  )
  const [colocando, setColocando] = useState<Colocando | undefined>(() => {
    if (!modo) return undefined

    // El punto de partida es la finca, si ya está ubicada. Una finca nueva no
    // lo está, y un pozo de una finca sin marcar tampoco: en esos casos se
    // coloca sobre lo que el usuario esté mirando, que es mejor que mandarlo
    // al medio de la nada.
    const ancla = marcadores.find((m) => m.id === (pozoAColocar ?? fincaAColocar))

    return {
      modo,
      farmId: fincaAColocar,
      wellId: pozoAColocar,
      lat: ancla?.lat ?? 0,
      lon: ancla?.lon ?? 0,
      quePunto:
        modo === 'finca'
          ? 'la finca'
          : `el pozo${ancla && ancla.tipo === 'finca' ? ` de ${ancla.nombre}` : ''}`,
      sinPunto: ancla === undefined,
    }
  })

  // El tope al que está abierta la ficha. Vive acá y no adentro de ella
  // porque el mapa lo necesita: es cuánta pantalla tiene que descontar para
  // que el punto elegido no quede debajo.
  const [tope, setTope] = useState<number | string | null>(TOPES[0]!)

  const [dibujando, setDibujando] = useState<Dibujando>()
  // Cuando el dibujo está terminado y falta ponerle nombre.
  const [porGuardar, setPorGuardar] = useState<Dibujando>()
  const [guardando, setGuardando] = useState(false)
  const [verAnotaciones, setVerAnotaciones] = useState(true)

  /**
   * Devuelve la app a los lectores de pantalla al cerrar una ficha.
   *
   * vaul se apoya en Radix, que mientras hay una ficha abierta marca el resto
   * de la página con `aria-hidden` — razonable para un diálogo modal, pero
   * estas fichas NO son modales: el mapa tiene que seguir usable debajo. Y al
   * cerrarse no siempre lo limpia, sobre todo cuando se abre una ficha desde
   * otra. El resultado es que la app entera —mapa, barra de dibujo,
   * navegación— desaparece para quien usa lector de pantalla, sin que se note
   * mirando la pantalla.
   *
   * Se limpia solo cuando no hay ninguna ficha abierta, para no pisar el
   * comportamiento correcto mientras sí la hay.
   */
  const hayFicha = seleccionado !== undefined || porGuardar !== undefined

  useEffect(() => {
    if (hayFicha) return

    // Se vigila el documento entero, no un elemento en particular: vaul marca
    // ancestros distintos según desde dónde se abrió la ficha, y limpiar uno
    // solo dejaba la app oculta igual.
    const limpiar = () => {
      for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
        // Lo que está adentro de una ficha, y los íconos marcados a mano como
        // decorativos, SÍ tienen que seguir ocultos.
        if (el.closest('[data-vaul-drawer]')) continue
        if (el.tagName.toLowerCase() === 'svg') continue
        if (!el.contains(document.querySelector('main'))) continue

        el.removeAttribute('aria-hidden')
      }
    }

    limpiar()

    const vigia = new MutationObserver(limpiar)
    vigia.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-hidden'],
    })

    return () => vigia.disconnect()
  }, [hayFicha])

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
        anotaciones={anotaciones}
        verAnotaciones={verAnotaciones}
        onVerAnotaciones={setVerAnotaciones}
        dibujando={dibujando}
        onPuntos={(puntos) => {
          setDibujando((actual) => (actual ? { ...actual, puntos } : actual))

          // El rectángulo se cierra solo con la segunda esquina: pedirle
          // además que toque «Listo» sería un paso de más.
          if (dibujando?.rectangulo && puntos.length === 4) {
            setDibujando(undefined)
            setPorGuardar({ ...dibujando, puntos })
          }
        }}
        onTerminarDibujo={() => {
          if (!dibujando) return
          setDibujando(undefined)
          setPorGuardar(dibujando)
        }}
        onCancelarDibujo={() => setDibujando(undefined)}
        irAMiUbicacion={puntoInicial === undefined}
        altoFicha={
          seleccionado && typeof tope === 'number'
            ? Math.min(tope, TOPE_QUE_SIGUE_EL_MAPA)
            : 0
        }
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
          const c = colocando!
          router.push(`${destinoDeColocacion(c.modo, c.farmId, c.wellId)}?${params}`)
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

      {porGuardar ? (
        <PanelDibujo
          forma={porGuardar.forma}
          puntos={porGuardar.puntos.length}
          guardando={guardando}
          inicial={
            porGuardar.id
              ? (() => {
                  const previa = anotaciones.find((a) => a.id === porGuardar.id)
                  return {
                    etiqueta: previa?.etiqueta ?? '',
                    notas: previa?.notas ?? '',
                    color: esClaveColor(previa?.color) ? previa.color : 'rojo',
                    pintado: previa?.pintado ?? false,
                  }
                })()
              : undefined
          }
          onCancelar={() => {
            if (guardando) return
            setPorGuardar(undefined)
          }}
          onBorrar={
            porGuardar.id
              ? async () => {
                  setGuardando(true)
                  const r = await borrarAnotacionAction(porGuardar.farmId, porGuardar.id!)
                  setGuardando(false)

                  if (!r.ok) {
                    toast.error(r.error)
                    return
                  }

                  setPorGuardar(undefined)
                  toast.success('Dibujo borrado')
                  router.refresh()
                }
              : undefined
          }
          onGuardar={async (datos: DatosDibujo) => {
            setGuardando(true)
            const r = await guardarAnotacionAction({
              id: porGuardar.id,
              farmId: porGuardar.farmId,
              forma: porGuardar.forma,
              puntos: porGuardar.puntos,
              etiqueta: datos.etiqueta,
              notas: datos.notas,
              color: datos.color,
              pintado: datos.pintado,
            })
            setGuardando(false)

            if (!r.ok) {
              toast.error(r.error)
              return
            }

            setPorGuardar(undefined)
            toast.success('Dibujo guardado')
            // Sin esto el mapa seguiría mostrando el estado anterior: los
            // dibujos vienen del servidor.
            router.refresh()
          }}
        />
      ) : null}

      <FichaMapa
        marcador={seleccionado}
        onCerrar={() => setSeleccionado(undefined)}
        tope={tope}
        onTope={setTope}
        onDibujar={(finca, forma, esRectangulo) => {
          // La ficha se va: el mapa tiene que quedar entero para dibujar.
          setSeleccionado(undefined)
          setVerAnotaciones(true)
          setDibujando({ forma, rectangulo: esRectangulo, farmId: finca.farmId, puntos: [] })
        }}
        onColocarPozo={(finca) => {
          // La ficha se cierra: el mapa tiene que quedar entero para apuntar.
          setSeleccionado(undefined)
          setColocando({
            modo: 'pozo',
            farmId: finca.farmId,
            lat: finca.lat,
            lon: finca.lon,
            quePunto: `el pozo de ${finca.nombreFinca}`,
          })
        }}
      />
    </div>
  )
}
