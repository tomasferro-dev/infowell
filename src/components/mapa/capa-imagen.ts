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

/** Una imagen ya guardada, tal como la necesita el mapa. */
export type ImagenGuardada = {
  id: string
  rutaArchivo: string
  esquinas: Esquinas
  opacidad: number
}

const PREFIJO_GUARDADA = 'imagen-guardada-'

/**
 * Dibuja las imágenes ya guardadas.
 *
 * Cada archivo se baja con `fetch` y se convierte en un `blob:` URL antes de
 * dárselo a MapLibre. No se le pasa la URL de la app directamente porque esa
 * ruta redirige a Supabase —otro origen— y una textura de WebGL cruzada
 * depende de las cabeceras CORS de un dominio que no controlamos. Un blob no
 * tiene origen: siempre funciona.
 *
 * Devuelve la función de limpieza. Revocar los blobs importa: sin eso, cada
 * visita al mapa deja las imágenes en memoria del navegador hasta recargar.
 */
export async function montarImagenesGuardadas(
  mapa: maplibregl.Map,
  imagenes: ImagenGuardada[],
  /** Para abandonar si el efecto se desmontó mientras se bajaban los archivos. */
  sigueVigente: () => boolean,
): Promise<() => void> {
  const urls: string[] = []
  const ids: string[] = []

  for (const imagen of imagenes) {
    if (!sigueVigente()) break

    try {
      const respuesta = await fetch(`/api/files/mapa/${imagen.rutaArchivo}`)
      if (!respuesta.ok) continue

      const url = URL.createObjectURL(await respuesta.blob())
      if (!sigueVigente()) {
        URL.revokeObjectURL(url)
        break
      }

      const id = PREFIJO_GUARDADA + imagen.id
      urls.push(url)
      ids.push(id)

      mapa.addSource(id, { type: 'image', url, coordinates: imagen.esquinas })
      mapa.addLayer({
        id,
        type: 'raster',
        source: id,
        paint: { 'raster-opacity': imagen.opacidad, 'raster-fade-duration': 0 },
      })
    } catch {
      // Una imagen que no baja no puede llevarse el mapa puesto: se saltea y
      // las demás se dibujan igual.
      continue
    }
  }

  return () => {
    for (const id of ids) {
      if (mapa.getLayer(id)) mapa.removeLayer(id)
      if (mapa.getSource(id)) mapa.removeSource(id)
    }
    for (const url of urls) URL.revokeObjectURL(url)
  }
}
