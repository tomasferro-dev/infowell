import { describe, expect, it } from 'vitest'

import { OPACIDAD_POR_DEFECTO, esEsquinas, esOpacidad } from '@/lib/imagen-mapa'

/**
 * Las cuatro esquinas de una imagen calzada sobre el mapa.
 *
 * Se valida acá y no solo en el formulario porque el valor viaja como Json a
 * la base: Prisma no lo mira, así que si esto no corta, entra cualquier cosa
 * y el mapa revienta al dibujar.
 */

/** Cuatro esquinas válidas sobre Luján de Cuyo, arriba-izquierda y horario. */
const VALIDAS = [
  [-68.9, -33.03],
  [-68.88, -33.03],
  [-68.88, -33.05],
  [-68.9, -33.05],
]

describe('las cuatro esquinas', () => {
  it('acepta cuatro pares [lon, lat] válidos', () => {
    expect(esEsquinas(VALIDAS)).toBe(true)
  })

  it('exige exactamente cuatro', () => {
    expect(esEsquinas(VALIDAS.slice(0, 3))).toBe(false)
    expect(esEsquinas([...VALIDAS, [-68.9, -33.06]])).toBe(false)
    expect(esEsquinas([])).toBe(false)
  })

  it('rechaza lo que no es una lista de pares', () => {
    expect(esEsquinas(null)).toBe(false)
    expect(esEsquinas(undefined)).toBe(false)
    expect(esEsquinas('-68.9,-33.03')).toBe(false)
    expect(esEsquinas({ 0: VALIDAS[0] })).toBe(false)
    expect(esEsquinas([[-68.9], [-68.88], [-68.88], [-68.9]])).toBe(false)
  })

  it('rechaza coordenadas fuera del mundo', () => {
    expect(esEsquinas([[-181, -33], ...VALIDAS.slice(1)])).toBe(false)
    expect(esEsquinas([[-68.9, 91], ...VALIDAS.slice(1)])).toBe(false)
  })

  /** Un NaN colado no rompe al guardar: rompe después, al dibujar. */
  it('rechaza NaN e infinitos', () => {
    expect(esEsquinas([[NaN, -33], ...VALIDAS.slice(1)])).toBe(false)
    expect(esEsquinas([[-68.9, Infinity], ...VALIDAS.slice(1)])).toBe(false)
  })

  it('rechaza números disfrazados de texto', () => {
    expect(esEsquinas([['-68.9', '-33.03'], ...VALIDAS.slice(1)])).toBe(false)
  })
})

describe('la opacidad', () => {
  it('acepta el rango de 0 a 1, bordes incluidos', () => {
    for (const v of [0, 0.5, OPACIDAD_POR_DEFECTO, 1]) expect(esOpacidad(v), String(v)).toBe(true)
  })

  it('rechaza lo que se sale del rango o no es número', () => {
    for (const v of [-0.1, 1.1, NaN, Infinity, '0.5', null, undefined]) {
      expect(esOpacidad(v), String(v)).toBe(false)
    }
  })

  /** Por defecto se ve la imagen, pero también el terreno debajo: es para calzar. */
  it('arranca en 0,8, no en opaco', () => {
    expect(OPACIDAD_POR_DEFECTO).toBe(0.8)
    expect(OPACIDAD_POR_DEFECTO).toBeLessThan(1)
  })
})
