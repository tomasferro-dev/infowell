import { describe, expect, it } from 'vitest'

import { destinoDeColocacion, esModo, ubicacionDeUrl } from '@/lib/colocacion-mapa'

describe('destino después de marcar el punto', () => {
  it('vuelve al alta o a la edición del pozo, según corresponda', () => {
    expect(destinoDeColocacion('pozo', 'f1', undefined)).toBe('/fincas/f1/pozos/nuevo')
    expect(destinoDeColocacion('pozo', 'f1', 'p1')).toBe('/fincas/f1/pozos/p1/editar')
  })

  it('vuelve al alta o a la edición de la finca', () => {
    expect(destinoDeColocacion('finca', undefined, undefined)).toBe('/fincas/nueva')
    expect(destinoDeColocacion('finca', 'f1', undefined)).toBe('/fincas/f1/editar')
  })

  it('sin finca, un pozo no tiene adónde volver: al listado', () => {
    expect(destinoDeColocacion('pozo', undefined, undefined)).toBe('/fincas')
  })

  it('escapa los ids: nunca se puede salir de la ruta armada acá', () => {
    const destino = destinoDeColocacion('pozo', '../../admin/usuarios', undefined)

    expect(destino.startsWith('/fincas/')).toBe(true)
    expect(destino).not.toContain('../')
    expect(destino).toBe('/fincas/..%2F..%2Fadmin%2Fusuarios/pozos/nuevo')
  })

  it('reconoce solo los dos modos que existen', () => {
    expect(esModo('pozo')).toBe(true)
    expect(esModo('finca')).toBe(true)
    expect(esModo('usuario')).toBe(false)
    expect(esModo(undefined)).toBe(false)
  })
})

describe('coordenadas que llegan por la URL', () => {
  it('acepta un par válido y lo recorta a 7 decimales', () => {
    const u = ubicacionDeUrl({ lat: '-33.04121234567', lon: '-68.8934' })

    expect(u.desdeMapa).toBe(true)
    expect(u.latitude).toBe('-33.0412123')
    expect(u.longitude).toBe('-68.8934000')
  })

  it('descarta lo que no es número, sin romper el formulario', () => {
    expect(ubicacionDeUrl({ lat: 'no-es', lon: '-68.9' }).desdeMapa).toBe(false)
    expect(ubicacionDeUrl({ lat: '', lon: '' }).desdeMapa).toBe(false)
    expect(ubicacionDeUrl({}).desdeMapa).toBe(false)
  })

  it('descarta coordenadas fuera del planeta', () => {
    expect(ubicacionDeUrl({ lat: '95', lon: '0' }).desdeMapa).toBe(false)
    expect(ubicacionDeUrl({ lat: '0', lon: '200' }).desdeMapa).toBe(false)
  })

  it('una sola coordenada no ubica nada', () => {
    expect(ubicacionDeUrl({ lat: '-33.04' }).desdeMapa).toBe(false)
    expect(ubicacionDeUrl({ lon: '-68.89' }).desdeMapa).toBe(false)
  })

  it('un parámetro repetido llega como arreglo y no se usa', () => {
    expect(ubicacionDeUrl({ lat: ['-33', '-34'], lon: '-68' }).desdeMapa).toBe(false)
  })
})
