import { describe, expect, it } from 'vitest'

import {
  centroDe,
  colorDe,
  esClaveColor,
  esPunto,
  limitesDe,
  MAXIMO_DE_PUNTOS,
  rectangulo,
  validarGeometria,
  type Punto,
} from '@/lib/anotaciones'

const MENDOZA: Punto = [-68.8934, -33.0412]

describe('un punto del mapa', () => {
  it('acepta un par [lon, lat] dentro del planeta', () => {
    expect(esPunto(MENDOZA)).toBe(true)
    expect(esPunto([0, 0])).toBe(true)
    expect(esPunto([180, 90])).toBe(true)
  })

  it('rechaza lo que se sale del planeta', () => {
    expect(esPunto([0, 100])).toBe(false)
    expect(esPunto([-200, 0])).toBe(false)
  })

  it('NO detecta un par invertido, y no puede', () => {
    // El error clásico es mandar [lat, lon] en vez de [lon, lat]. Con Mendoza
    // invertida —[-33.04, -68.89]— los dos valores siguen estando en rango, y
    // ninguna validación de rango lo va a ver. Queda escrito para que nadie
    // confíe en esta función para eso: el orden se garantiza en el borde donde
    // se arma el punto, no acá.
    expect(esPunto([-33.0412, -68.8934])).toBe(true)
  })

  it('rechaza lo que no es un par de números', () => {
    expect(esPunto([1])).toBe(false)
    expect(esPunto([1, 2, 3])).toBe(false)
    expect(esPunto(['1', '2'])).toBe(false)
    expect(esPunto([NaN, 0])).toBe(false)
    expect(esPunto(null)).toBe(false)
    expect(esPunto({ lon: 1, lat: 2 })).toBe(false)
  })
})

describe('validación de la geometría', () => {
  it('un punto suelto llega como par y sale como lista de uno', () => {
    const r = validarGeometria('PUNTO', MENDOZA)

    expect(r.ok).toBe(true)
    // Siempre lista: que la forma cambie el tipo obligaría a ramificar en
    // cada lugar que toca el dato.
    if (r.ok) expect(r.puntos).toEqual([MENDOZA])
  })

  it('exige el mínimo de puntos de cada forma', () => {
    expect(validarGeometria('LINEA', [MENDOZA]).ok).toBe(false)
    expect(validarGeometria('POLIGONO', [MENDOZA, [-68.9, -33.1]]).ok).toBe(false)

    expect(validarGeometria('LINEA', [MENDOZA, [-68.9, -33.1]]).ok).toBe(true)
    expect(validarGeometria('POLIGONO', [MENDOZA, [-68.9, -33.1], [-68.8, -33.2]]).ok).toBe(true)
  })

  it('el mensaje dice qué falta, no solo que está mal', () => {
    const r = validarGeometria('POLIGONO', [MENDOZA])

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/al menos 3 puntos/)
  })

  it('rechaza un dibujo con un punto corrupto en el medio', () => {
    const r = validarGeometria('LINEA', [MENDOZA, [999, 999], [-68.8, -33.2]])

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/coordenada/)
  })

  it('pone un techo a la cantidad de puntos', () => {
    const muchos = Array.from({ length: MAXIMO_DE_PUNTOS + 1 }, (_, i) => [-68 - i / 1000, -33] as Punto)

    // Nadie dibuja doscientos vértices con el dedo: eso llega de un cliente
    // modificado, no de un usuario.
    expect(validarGeometria('POLIGONO', muchos).ok).toBe(false)
    expect(validarGeometria('POLIGONO', muchos.slice(0, MAXIMO_DE_PUNTOS)).ok).toBe(true)
  })

  it('no se rompe con basura', () => {
    expect(validarGeometria('LINEA', null).ok).toBe(false)
    expect(validarGeometria('LINEA', 'unas lineas').ok).toBe(false)
    expect(validarGeometria('LINEA', []).ok).toBe(false)
  })
})

describe('rectángulo a partir de dos esquinas', () => {
  it('devuelve cuatro vértices en orden, sin repetir el primero', () => {
    const r = rectangulo([-69, -33], [-68, -34])

    expect(r).toEqual([
      [-69, -33],
      [-68, -33],
      [-68, -34],
      [-69, -34],
    ])
  })

  it('funciona con las esquinas dadas en cualquier orden', () => {
    const unOrden = rectangulo([-69, -33], [-68, -34])
    const otroOrden = rectangulo([-68, -34], [-69, -33])

    // Los vértices son los mismos aunque se recorran al revés.
    expect([...unOrden].sort()).toEqual([...otroOrden].sort())
  })

  it('es un perímetro válido', () => {
    expect(validarGeometria('POLIGONO', rectangulo([-69, -33], [-68, -34])).ok).toBe(true)
  })
})

describe('centro y límites', () => {
  it('el centro sirve para poner la etiqueta', () => {
    expect(centroDe([[-69, -33], [-67, -33]])).toEqual([-68, -33])
  })

  it('los límites abarcan el dibujo entero', () => {
    const l = limitesDe([
      [-69, -33],
      [-68, -34],
      [-68.5, -32.5],
    ])

    expect(l).toEqual({ oeste: -69, sur: -34, este: -68, norte: -32.5 })
  })

  it('un solo punto da límites degenerados, no NaN', () => {
    expect(limitesDe([MENDOZA])).toEqual({
      oeste: -68.8934,
      sur: -33.0412,
      este: -68.8934,
      norte: -33.0412,
    })
  })
})

describe('la paleta', () => {
  it('es cerrada: un color inventado cae al primero', () => {
    expect(esClaveColor('rojo')).toBe(true)
    expect(esClaveColor('fucsia')).toBe(false)
    expect(colorDe('fucsia')).toBe(colorDe('rojo'))
  })

  it('devuelve un color CSS de verdad', () => {
    expect(colorDe('celeste')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
