import type * as maplibregl from 'maplibre-gl'

import { ALTO_PANEL_CALZADO, type Esquinas, rectanguloInicial } from '@/lib/imagen-mapa'

/**
 * La imagen que el usuario calza sobre el satelital.
 *
 * MapLibre exige `url` en una fuente de tipo imagen: la opción `image` con un
 * bitmap ya decodificado existe solo en `updateImage()`, no al crear la
 * fuente. Se usa un `blob:` URL, que pertenece al PROPIO origen — así el
 * archivo privado, que llega por un redirect a Supabase, nunca depende de las
 * cabeceras CORS de otro dominio para llegar a una textura de WebGL.
 *
 * La capa se agrega como una más y NO se eleva: `elevarCapas` sube los dibujos
 * en cada `styledata`, así que la imagen queda debajo de ellos sola. Un dibujo
 * tapado por una foto sería una regresión invisible.
 */

export const FUENTE_IMAGEN = 'imagen-calzada'
export const CAPA_IMAGEN = 'imagen-calzada-capa'

/** Las cuatro esquinas de un rectángulo de pantalla, en lon/lat. */
export function esquinasDeRectangulo(
  mapa: maplibregl.Map,
  r: { x: number; y: number; ancho: number; alto: number },
): Esquinas {
  // Arriba-izquierda y sentido horario, que es lo que exige ImageSource.
  const puntos: [number, number][] = [
    [r.x, r.y],
    [r.x + r.ancho, r.y],
    [r.x + r.ancho, r.y + r.alto],
    [r.x, r.y + r.alto],
  ]

  // unproject y no aritmética de grados: en Mendoza un grado de longitud mide
  // bastante menos que uno de latitud, así que sumar y restar grados deforma
  // la imagen. Además, si el mapa está girado, esto devuelve el cuadrilátero
  // girado sin que haya que calcularlo.
  return puntos.map((p) => {
    const c = mapa.unproject(p)
    return [c.lng, c.lat] as [number, number]
  }) as Esquinas
}

/** El rectángulo de pantalla con el que arranca una imagen recién subida. */
export function rectanguloParaMapa(
  mapa: maplibregl.Map,
  anchoImagen: number,
  altoImagen: number,
): { x: number; y: number; ancho: number; alto: number } {
  const lienzo = mapa.getCanvas()
  return rectanguloInicial({
    anchoImagen,
    altoImagen,
    ancho: lienzo.clientWidth,
    alto: lienzo.clientHeight,
    // El panel de calzado tapa la franja de abajo. Sin reservarla, la imagen
    // arranca con su mitad inferior detrás del panel.
    reservadoAbajo: lienzo.clientHeight * ALTO_PANEL_CALZADO,
  })
}

export function montarImagen(
  mapa: maplibregl.Map,
  url: string,
  esquinas: Esquinas,
  opacidad: number,
) {
  quitarImagen(mapa)

  mapa.addSource(FUENTE_IMAGEN, { type: 'image', url, coordinates: esquinas })
  mapa.addLayer({
    id: CAPA_IMAGEN,
    type: 'raster',
    source: FUENTE_IMAGEN,
    paint: { 'raster-opacity': opacidad, 'raster-fade-duration': 0 },
  })
}

/**
 * Mueve la imagen sin recrearla.
 *
 * Se llama en cada cuadro mientras el usuario arrastra el mapa, así que
 * recrear la fuente acá haría parpadear la imagen sesenta veces por segundo.
 */
export function moverImagen(mapa: maplibregl.Map, esquinas: Esquinas) {
  const fuente = mapa.getSource(FUENTE_IMAGEN)
  if (fuente && 'setCoordinates' in fuente) {
    ;(fuente as maplibregl.ImageSource).setCoordinates(esquinas)
  }
}

export function opacidadImagen(mapa: maplibregl.Map, opacidad: number) {
  if (mapa.getLayer(CAPA_IMAGEN)) {
    mapa.setPaintProperty(CAPA_IMAGEN, 'raster-opacity', opacidad)
  }
}

export function quitarImagen(mapa: maplibregl.Map) {
  if (mapa.getLayer(CAPA_IMAGEN)) mapa.removeLayer(CAPA_IMAGEN)
  if (mapa.getSource(FUENTE_IMAGEN)) mapa.removeSource(FUENTE_IMAGEN)
}
