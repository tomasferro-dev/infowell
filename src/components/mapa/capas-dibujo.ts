import type * as maplibregl from 'maplibre-gl'

import { COLORES, type Punto } from '@/lib/anotaciones'
import type { AnotacionMapa } from '@/server/queries/farms'

/**
 * Las capas del mapa que dibujan las anotaciones.
 *
 * Van como capas del estilo y no como elementos del DOM —al revés que los
 * marcadores—: son formas geográficas, tienen que deformarse con el zoom y la
 * inclinación, y pueden ser cientos. Un div por vértice no sobreviviría.
 */

export const FUENTE = 'anotaciones'
export const FUENTE_BORRADOR = 'anotaciones-borrador'

const CAPAS = {
  relleno: 'anotaciones-relleno',
  linea: 'anotaciones-linea',
  punto: 'anotaciones-punto',
  etiqueta: 'anotaciones-etiqueta',
  vertice: 'anotaciones-vertice',
  borradorLinea: 'anotaciones-borrador-linea',
  borradorRelleno: 'anotaciones-borrador-relleno',
  borradorVertice: 'anotaciones-borrador-vertice',
} as const

/** Todas las capas de dibujo, para poder apagarlas de una. */
export const CAPAS_DE_DIBUJO = [CAPAS.relleno, CAPAS.linea, CAPAS.punto, CAPAS.etiqueta]

type Coleccion = GeoJSON.FeatureCollection<GeoJSON.Geometry>

/** El color sale de una propiedad del dato, no de una capa por color. */
const COLOR_POR_CLAVE: (string | string[])[] = Object.entries(COLORES).flat()

function pinta(por_defecto: string) {
  return ['match', ['get', 'color'], ...COLOR_POR_CLAVE, por_defecto] as unknown as string
}

/** Convierte las anotaciones a GeoJSON. Un punto es un punto; el resto, líneas. */
export function aGeoJson(anotaciones: AnotacionMapa[]): Coleccion {
  return {
    type: 'FeatureCollection',
    features: anotaciones.map((a) => ({
      type: 'Feature' as const,
      id: a.id,
      properties: {
        id: a.id,
        farmId: a.farmId,
        forma: a.forma,
        color: a.color,
        pintado: a.pintado,
        // Sin etiqueta no se dibuja texto: un rótulo vacío deja un hueco.
        etiqueta: a.etiqueta ?? '',
      },
      geometry: geometriaDe(a.forma, a.puntos),
    })),
  }
}

function geometriaDe(forma: AnotacionMapa['forma'], puntos: Punto[]): GeoJSON.Geometry {
  if (forma === 'PUNTO') return { type: 'Point', coordinates: puntos[0]! }
  if (forma === 'LINEA') return { type: 'LineString', coordinates: puntos }

  // GeoJSON exige que el anillo de un polígono cierre repitiendo el primer
  // punto. En la base no se guarda repetido —sería un punto que el usuario
  // nunca marcó—, así que se cierra al dibujar.
  return { type: 'Polygon', coordinates: [[...puntos, puntos[0]!]] }
}

/** El dibujo en curso: la forma a medio hacer y sus vértices. */
export function borradorAGeoJson(forma: AnotacionMapa['forma'], puntos: Punto[]): Coleccion {
  const features: GeoJSON.Feature[] = puntos.map((p, i) => ({
    type: 'Feature',
    properties: { orden: i + 1 },
    geometry: { type: 'Point', coordinates: p },
  }))

  if (puntos.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry:
        forma === 'POLIGONO' && puntos.length >= 3
          ? { type: 'Polygon', coordinates: [[...puntos, puntos[0]!]] }
          : { type: 'LineString', coordinates: puntos },
    })
  }

  return { type: 'FeatureCollection', features }
}

const VACIO: Coleccion = { type: 'FeatureCollection', features: [] }

/**
 * Cuelga las capas del mapa. Idempotente: si ya están, no hace nada.
 *
 * El orden importa. Los rellenos van abajo de las líneas y las líneas abajo de
 * los puntos, o un perímetro pintado taparía las referencias que están
 * adentro, que son justo las que hay que ver.
 */
export function montarCapas(mapa: maplibregl.Map) {
  if (mapa.getSource(FUENTE)) return

  mapa.addSource(FUENTE, { type: 'geojson', data: VACIO })
  mapa.addSource(FUENTE_BORRADOR, { type: 'geojson', data: VACIO })

  mapa.addLayer({
    id: CAPAS.relleno,
    type: 'fill',
    source: FUENTE,
    filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'pintado'], true]],
    paint: { 'fill-color': pinta(COLORES.rojo), 'fill-opacity': 0.25 },
  })

  mapa.addLayer({
    id: CAPAS.linea,
    type: 'line',
    source: FUENTE,
    filter: ['!=', ['geometry-type'], 'Point'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': pinta(COLORES.rojo),
      'line-width': 3,
      // Un borde oscuro por debajo no es adorno: sobre imagen satelital, una
      // línea de color plano se pierde apenas el fondo es claro.
      'line-opacity': 0.95,
    },
  })

  mapa.addLayer({
    id: CAPAS.punto,
    type: 'circle',
    source: FUENTE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': pinta(COLORES.rojo),
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  })

  mapa.addLayer({
    id: CAPAS.etiqueta,
    type: 'symbol',
    source: FUENTE,
    filter: ['!=', ['get', 'etiqueta'], ''],
    layout: {
      'text-field': ['get', 'etiqueta'],
      // Con estilo propio hay que nombrar la tipografía: no hay una heredada.
      'text-font': ['Open Sans Semibold'],
      'text-size': 12,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-max-width': 9,
      // Si no entra, no se dibuja: dos rótulos encimados no se leen.
      'text-allow-overlap': false,
      'symbol-sort-key': 1,
    },
    paint: {
      'text-color': '#fff',
      'text-halo-color': 'rgba(0,0,0,0.75)',
      'text-halo-width': 1.6,
    },
  })

  // El borrador va arriba de todo: es lo que el usuario está haciendo ahora.
  mapa.addLayer({
    id: CAPAS.borradorRelleno,
    type: 'fill',
    source: FUENTE_BORRADOR,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#fff', 'fill-opacity': 0.2 },
  })

  mapa.addLayer({
    id: CAPAS.borradorLinea,
    type: 'line',
    source: FUENTE_BORRADOR,
    filter: ['!=', ['geometry-type'], 'Point'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#fff', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
  })

  mapa.addLayer({
    id: CAPAS.borradorVertice,
    type: 'circle',
    source: FUENTE_BORRADOR,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 6,
      'circle-color': '#fff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#111',
    },
  })
}

/**
 * Sube las capas de dibujo por encima de todo.
 *
 * Se cuelgan en el primer `styledata`, cuando el estilo todavía está armándose:
 * lo que MapTiler agregue después —la imagen satelital, entre otras— queda
 * encima y las entierra. El síntoma es el peor posible: las capas existen,
 * tienen datos, están en pantalla, y no se ve nada.
 *
 * Se llama en cada `styledata`, así que reordena también después de una
 * recarga de estilo. Es idempotente.
 */
export function elevarCapas(mapa: maplibregl.Map) {
  for (const capa of ORDEN_ENCIMA) {
    if (mapa.getLayer(capa)) mapa.moveLayer(capa)
  }
}

/** De abajo hacia arriba: rellenos, líneas, puntos, rótulos y el borrador. */
const ORDEN_ENCIMA = [
  CAPAS.relleno,
  CAPAS.linea,
  CAPAS.punto,
  CAPAS.etiqueta,
  CAPAS.borradorRelleno,
  CAPAS.borradorLinea,
  CAPAS.borradorVertice,
]

export function actualizarFuente(mapa: maplibregl.Map, fuente: string, datos: Coleccion) {
  const src = mapa.getSource(fuente)
  if (src && 'setData' in src) (src as maplibregl.GeoJSONSource).setData(datos)
}

/** Apaga o enciende todos los dibujos guardados, sin tocar el borrador. */
export function mostrarDibujos(mapa: maplibregl.Map, visible: boolean) {
  for (const capa of CAPAS_DE_DIBUJO) {
    if (mapa.getLayer(capa)) {
      mapa.setLayoutProperty(capa, 'visibility', visible ? 'visible' : 'none')
    }
  }
}
