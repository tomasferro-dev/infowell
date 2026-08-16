import { describe, expect, it } from 'vitest'

import { toSlug } from '@/lib/slug'

/**
 * El slug es la defensa contra catálogos duplicados: los usuarios crean
 * servicios y electrobombas al vuelo desde el combobox y escriben distinto cada
 * vez. Dos entradas que un humano leería como la misma deben colapsar al mismo
 * slug, que es único en la base.
 */
describe('toSlug', () => {
  it('normaliza a minúsculas y separa por guiones', () => {
    expect(toSlug('Perforación de pozo')).toBe('perforacion-de-pozo')
  })

  it('quita tildes y eñes', () => {
    expect(toSlug('Filmación de pozo')).toBe('filmacion-de-pozo')
    expect(toSlug('Cañería')).toBe('caneria')
  })

  it('colapsa variantes de tipeo del mismo servicio', () => {
    const variantes = ['Bobinado', 'bobinado ', '  BOBINADO', 'Bobinado.']
    const slugs = new Set(variantes.map(toSlug))

    expect(slugs).toEqual(new Set(['bobinado']))
  })

  it('no deja guiones al principio ni al final', () => {
    expect(toSlug('  ¿Pesca de electrobomba?  ')).toBe('pesca-de-electrobomba')
  })

  it('colapsa separadores repetidos en uno solo', () => {
    expect(toSlug('Mantenimiento   y / rehabilitación')).toBe('mantenimiento-y-rehabilitacion')
  })

  it('conserva los números (aparecen en modelos de bomba)', () => {
    expect(toSlug('Grundfos SP 5A-12')).toBe('grundfos-sp-5a-12')
  })

  it('devuelve cadena vacía si no queda nada utilizable', () => {
    expect(toSlug('   ???   ')).toBe('')
  })
})
