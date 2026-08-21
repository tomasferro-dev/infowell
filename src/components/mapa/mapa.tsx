'use client'

import 'maplibre-gl/dist/maplibre-gl.css'

import { Check, Crosshair, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MarcadorMapa } from '@/server/queries/farms'

/**
 * El mapa satelital.
 *
 * Se carga con `next/dynamic` desde mapa-cargable.tsx: maplibre-gl pesa unos
 * 200 kB comprimidos y no tiene por qué viajar en el bundle de una app que se
 * usa mayormente para cargar remitos.
 *
 * La imagen sale de MapTiler. Es nítida hasta z17-18 sobre Mendoza; más cerca
 * la interpola. No se fuerza un zoom mayor porque no habría nada nuevo que
 * ver: el GPS del teléfono tiene ±8-10 m de error, así que el detalle
 * sub-métrico no aporta nada operativo.
 */

const CLAVE = process.env.NEXT_PUBLIC_MAPTILER_KEY

/** Mendoza capital: el encuadre de respaldo cuando no hay nada que mostrar. */
const CENTRO_POR_DEFECTO: [number, number] = [-68.8458, -32.8895]

/**
 * Desde acá se muestran los pozos.
 *
 * Un pozo está a decenas de metros del casco de su finca, así que de lejos los
 * pines se pisan y ninguno se puede tocar. De lejos se ven las fincas; al
 * acercarse aparecen sus pozos. Es lo que hace cualquier mapa con puntos
 * anidados, y es lo que el usuario ya espera.
 */
const ZOOM_POZOS = 13

/** Cuánto de la pantalla tapa la ficha. Debe coincidir con ficha-mapa.tsx. */
const ALTO_FICHA = 0.7

/** Zoom al que se coloca un pozo: suficiente para apuntar al cabezal. */
const ZOOM_COLOCAR = 17

export function Mapa({
  marcadores,
  seleccionado,
  onSeleccion,
  colocando,
  onColocar,
  onCancelarColocacion,
  irAMiUbicacion = true,
}: {
  marcadores: MarcadorMapa[]
  seleccionado?: MarcadorMapa
  onSeleccion: (marcador: MarcadorMapa | undefined) => void
  /** Punto desde donde arranca la colocación, o undefined si no está activa. */
  colocando?: { lat: number; lon: number; nombreFinca: string }
  onColocar: (lat: number, lon: number) => void
  onCancelarColocacion: () => void
  /**
   * Si arranca yendo a la ubicación del usuario.
   *
   * Se apaga cuando el mapa se abrió sobre un punto concreto (`?punto=`): el
   * usuario pidió ESE pozo, no dónde está parado. Además el seguimiento de
   * ubicación recentra solo y le pelearía al encuadre, dejando los pines
   * moviéndose sin parar.
   */
  irAMiUbicacion?: boolean
}) {
  const contenedor = useRef<HTMLDivElement>(null)

  // El mapa vive en estado y no en un ref: los efectos que le cuelgan cosas
  // necesitan volver a correr cuando se recrea. Con un ref no se enterarían.
  const [mapa, setMapa] = useState<maplibregl.Map>()

  // onSeleccion se guarda en un ref: si entrara como dependencia del efecto,
  // cada render del padre destruiría y recrearía el mapa entero. La
  // asignación va en su propio efecto porque escribir un ref durante el
  // render deja al compilador de React sin garantías.
  const alSeleccionar = useRef(onSeleccion)
  useEffect(() => {
    alSeleccionar.current = onSeleccion
  })

  useEffect(() => {
    if (!contenedor.current || !CLAVE) return

    const m = new maplibregl.Map({
      container: contenedor.current,
      // Híbrido y no satélite pelado: los nombres de ruta y de paraje son lo
      // que permite ubicarse en el campo, donde no hay otra referencia.
      style: `https://api.maptiler.com/maps/hybrid/style.json?key=${CLAVE}`,
      center: CENTRO_POR_DEFECTO,
      zoom: 8,
      // La inclinación es lo que da la sensación de Earth sin traer un motor 3D.
      pitch: 0,
      maxPitch: 70,
      attributionControl: { compact: true },
    })

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

    const ubicacion = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    })
    m.addControl(ubicacion, 'top-right')

    // Arranca en la ubicación del usuario, que es lo que se pidió. No cuelga
    // de 'load': ese evento no llega a dispararse cuando React vuelve a montar
    // el componente (StrictMode en desarrollo lo hace siempre), y esperarlo
    // dejaba el mapa mudo. El control necesita un tick para quedar armado, así
    // que trigger() va en el siguiente turno del reloj.
    const reloj = irAMiUbicacion ? setTimeout(() => ubicacion.trigger(), 300) : undefined

    // Tocar la imagen (no un marcador) cierra la ficha abierta.
    m.on('click', () => alSeleccionar.current(undefined))

    setMapa(m)

    return () => {
      if (reloj !== undefined) clearTimeout(reloj)
      m.remove()
      setMapa(undefined)
    }
    // irAMiUbicacion no entra como dependencia: se decide al abrir el mapa y
    // recrearlo por eso tiraría abajo la vista que el usuario está mirando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Encuadre inicial: todo lo que el usuario puede ver entra en pantalla. */
  useEffect(() => {
    if (!mapa || marcadores.length === 0) return

    const limites = marcadores.reduce(
      (acc, p) => acc.extend([p.lon, p.lat]),
      new maplibregl.LngLatBounds(
        [marcadores[0]!.lon, marcadores[0]!.lat],
        [marcadores[0]!.lon, marcadores[0]!.lat],
      ),
    )

    mapa.fitBounds(limites, { padding: 64, maxZoom: 15, animate: false })
  }, [mapa, marcadores])

  /* Marcadores. Son elementos del DOM que el mapa posiciona, no capas del
     estilo, así que se pueden colgar apenas existe el mapa. */
  useEffect(() => {
    if (!mapa) return

    const puestos = marcadores.map((punto) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'marcador-mapa'
      el.dataset.tipo = punto.tipo
      el.dataset.id = punto.id
      el.setAttribute(
        'aria-label',
        punto.tipo === 'finca' ? `Finca ${punto.nombre}` : `Pozo ${punto.nombre}`,
      )
      el.innerHTML =
        punto.tipo === 'finca'
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12h-6v-7H9v7z"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2s6 7.2 6 11.4A6 6 0 0 1 6 13.4C6 9.2 12 2 12 2z"/></svg>'

      el.addEventListener('click', (evento) => {
        // Sin esto el click llega al mapa y cierra la ficha recién abierta.
        evento.stopPropagation()
        alSeleccionar.current(punto)
      })

      return new maplibregl.Marker({ element: el }).setLngLat([punto.lon, punto.lat]).addTo(mapa)
    })

    const acomodarPorZoom = () => {
      const lejos = mapa.getZoom() < ZOOM_POZOS
      for (const marcador of puestos) {
        const el = marcador.getElement()
        el.dataset.oculto = String(lejos && el.dataset.tipo === 'pozo')
      }
    }

    acomodarPorZoom()
    mapa.on('zoom', acomodarPorZoom)

    return () => {
      mapa.off('zoom', acomodarPorZoom)
      for (const marcador of puestos) marcador.remove()
    }
  }, [mapa, marcadores])

  /**
   * Modo colocación.
   *
   * La mira queda fija en el centro y el usuario mueve el mapa por debajo. Es
   * al revés de tocar el punto con el dedo, y es a propósito: el dedo tapa
   * justo lo que hay que mirar, y en un cabezal de pozo de un metro eso es la
   * diferencia entre marcarlo bien y marcar el tinglado de al lado.
   *
   * La lectura se refresca al soltar y no durante el arrastre: durante el
   * arrastre el evento corre a 60 por segundo y nadie lee un número que se
   * mueve así.
   */
  const [centro, setCentro] = useState<{ lat: number; lon: number }>()

  useEffect(() => {
    if (!mapa || !colocando) return

    mapa.easeTo({
      center: [colocando.lon, colocando.lat],
      zoom: Math.max(mapa.getZoom(), ZOOM_COLOCAR),
      padding: { top: 0, left: 0, right: 0, bottom: 0 },
      duration: 600,
    })

    const leerCentro = () => {
      const c = mapa.getCenter()
      setCentro({ lat: c.lat, lon: c.lng })
    }

    leerCentro()
    mapa.on('moveend', leerCentro)

    return () => {
      mapa.off('moveend', leerCentro)
    }
  }, [mapa, colocando])

  /* El marcador abierto se resalta, para no perderlo detrás de la ficha. */
  useEffect(() => {
    if (!contenedor.current) return

    for (const el of contenedor.current.querySelectorAll<HTMLElement>('.marcador-mapa')) {
      el.dataset.activo = String(el.dataset.id === seleccionado?.id)
    }
  }, [seleccionado, marcadores, mapa])

  /**
   * Encuadre del punto elegido.
   *
   * Centrarlo a secas lo dejaría justo detrás de la ficha, que ocupa el 70% de
   * abajo. El `padding` le dice al mapa que el área útil es solo la franja que
   * queda a la vista, y ahí sí el punto queda donde el usuario lo puede ver.
   */
  useEffect(() => {
    if (!mapa || colocando) return

    const alto = mapa.getContainer().clientHeight
    const relleno = { top: 0, left: 0, right: 0, bottom: seleccionado ? alto * ALTO_FICHA : 0 }

    if (seleccionado) {
      mapa.easeTo({
        center: [seleccionado.lon, seleccionado.lat],
        zoom: Math.max(mapa.getZoom(), ZOOM_POZOS + 1),
        padding: relleno,
        duration: 600,
      })
    } else {
      mapa.easeTo({ padding: relleno, duration: 300 })
    }
  }, [mapa, seleccionado, colocando])

  if (!CLAVE) {
    return (
      <div className="bg-muted text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        <p>
          Falta <code className="font-mono">NEXT_PUBLIC_MAPTILER_KEY</code>. Sin esa variable no
          se puede pedir la imagen satelital.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={contenedor}
        /* pointer-events-auto no es decorativo: vaul se apoya en Radix, que
           pone `pointer-events: none` en el body mientras la ficha está abierta
           aunque sea no-modal. Sin esto, con la ficha abierta no se puede tocar
           otro marcador ni mover el mapa. Se devuelve solo acá: el resto de la
           página sigue inerte, que es lo que corresponde. */
        className="pointer-events-auto h-full w-full"
        // Los tests esperan a que el mapa exista antes de tocar un marcador.
        data-listo={mapa !== undefined}
      />

      {colocando ? (
        <>
          {/* La mira. No intercepta el dedo: el mapa se tiene que poder
              arrastrar tomándolo justo por el centro. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <Crosshair className="size-10 text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
          </div>

          {/* Debajo del botón «Volver», que vive en la misma esquina. */}
          <div className="pointer-events-none absolute inset-x-3 top-16 z-20">
            <p className="bg-card/95 rounded-md border px-3 py-2 text-center text-sm shadow-md backdrop-blur">
              Movés el mapa hasta poner la mira sobre el pozo.
              <span className="text-muted-foreground block text-xs">
                Se agrega a {colocando.nombreFinca}
              </span>
            </p>
          </div>

          <div
            data-colocando="true"
            className="bg-card/95 pointer-events-auto absolute inset-x-0 bottom-0 z-20 space-y-2 border-t p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] backdrop-blur"
          >
            <p className="text-muted-foreground text-center font-mono text-xs tabular-nums">
              {centro ? `${centro.lat.toFixed(6)}, ${centro.lon.toFixed(6)}` : '—'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                onClick={onCancelarColocacion}
              >
                <X className="size-4" />
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-12 flex-1"
                disabled={!centro}
                onClick={() => {
                  if (centro) onColocar(centro.lat, centro.lon)
                }}
              >
                <Check className="size-4" />
                Poner el pozo acá
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
