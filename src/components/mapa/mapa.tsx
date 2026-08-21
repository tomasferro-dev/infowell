'use client'

import 'maplibre-gl/dist/maplibre-gl.css'

import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

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

export function Mapa({
  marcadores,
  seleccionado,
  onSeleccion,
}: {
  marcadores: MarcadorMapa[]
  seleccionado?: MarcadorMapa
  onSeleccion: (marcador: MarcadorMapa | undefined) => void
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
    const reloj = setTimeout(() => ubicacion.trigger(), 300)

    // Tocar la imagen (no un marcador) cierra la ficha abierta.
    m.on('click', () => alSeleccionar.current(undefined))

    setMapa(m)

    return () => {
      clearTimeout(reloj)
      m.remove()
      setMapa(undefined)
    }
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
    if (!mapa) return

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
  }, [mapa, seleccionado])

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
  )
}
