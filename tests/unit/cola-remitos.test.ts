import { describe, expect, it } from 'vitest'

import { esFalloDeRed, ordenarCola, type RemitoEnCola } from '@/lib/cola-remitos'

/**
 * Qué se encola y qué no.
 *
 * Es la decisión que sostiene toda la cola: encolar un rechazo del servidor
 * —un monto inválido, un permiso que no está— haría reintentar para siempre
 * algo que nunca va a andar, y el operario vería «pendiente» sin entender por
 * qué nunca sube. Y NO encolar un fallo de red le pierde el remito.
 */

describe('qué es un fallo de red', () => {
  it('un fetch que no sali\u00f3 es fallo de red', () => {
    // Lo que tira fetch cuando no hay señal: no llegó a haber respuesta.
    expect(esFalloDeRed(new TypeError('Failed to fetch'))).toBe(true)
    expect(esFalloDeRed(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      true,
    )
    expect(esFalloDeRed(new TypeError('Load failed'))).toBe(true)
  })

  it('un pedido abortado también: se corta la señal a mitad de camino', () => {
    const abortado = new DOMException('The operation was aborted.', 'AbortError')
    expect(esFalloDeRed(abortado)).toBe(true)
  })

  /**
   * Lo importante del otro lado: un rechazo del servidor NO se encola. El
   * servidor contestó, y su respuesta no va a cambiar por reintentarla.
   */
  it('un rechazo del servidor NO es fallo de red', () => {
    expect(esFalloDeRed(new Error('El archivo no es de un tipo permitido.'))).toBe(false)
    expect(esFalloDeRed(new Error('No tenés permiso para subir archivos a esta finca.'))).toBe(
      false,
    )
    expect(esFalloDeRed(new Error('Revisá los datos'))).toBe(false)
  })

  it('lo que no es un error tampoco se encola', () => {
    for (const valor of [null, undefined, 'texto suelto', 42, {}]) {
      expect(esFalloDeRed(valor), JSON.stringify(valor)).toBe(false)
    }
  })
})

describe('el orden de la cola', () => {
  const hacer = (id: string, creadoEl: number): RemitoEnCola =>
    ({ id, creadoEl, farmId: 'f', intentos: 0 }) as RemitoEnCola

  /** Lo más viejo primero: es el orden en que el operario cargó las cosas. */
  it('sale lo más viejo primero', () => {
    const salida = ordenarCola([hacer('b', 200), hacer('a', 100), hacer('c', 300)])
    expect(salida.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('no rompe con la cola vacía ni con uno solo', () => {
    expect(ordenarCola([])).toEqual([])
    expect(ordenarCola([hacer('a', 1)]).map((r) => r.id)).toEqual(['a'])
  })

  it('no modifica el arreglo que recibe', () => {
    const original = [hacer('b', 200), hacer('a', 100)]
    ordenarCola(original)
    expect(original.map((r) => r.id)).toEqual(['b', 'a'])
  })
})
