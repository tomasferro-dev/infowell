import { describe, expect, it } from 'vitest'

import { coincide, encontrarDuplicado, filtrarCatalogo } from '@/lib/catalog'

/**
 * El combobox se usa en el campo, con una mano y a las apuradas. Nadie va a
 * escribir "Perforación" con tilde: si la búsqueda no ignora los acentos, el
 * operario no encuentra el servicio, lo crea de nuevo sin tilde y el catálogo
 * termina con dos filas para la misma cosa.
 */
describe('coincide', () => {
  it('ignora los acentos en ambos sentidos', () => {
    expect(coincide('Perforación de pozo', 'perforacion')).toBe(true)
    expect(coincide('Perforacion de pozo', 'perforación')).toBe(true)
  })

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(coincide('Bobinado', '  BOBINADO ')).toBe(true)
  })

  it('busca en cualquier parte del texto, no solo al principio', () => {
    expect(coincide('Venta de electrobomba', 'electrobomba')).toBe(true)
  })

  it('con búsqueda vacía coincide con todo', () => {
    expect(coincide('Lo que sea', '')).toBe(true)
    expect(coincide('Lo que sea', '   ')).toBe(true)
  })

  it('no coincide cuando realmente no está', () => {
    expect(coincide('Bobinado', 'perforacion')).toBe(false)
  })
})

describe('filtrarCatalogo', () => {
  const servicios = [
    { id: '1', name: 'Perforación de pozo' },
    { id: '2', name: 'Limpieza de perforación' },
    { id: '3', name: 'Bobinado' },
  ]

  it('devuelve todos los que coinciden', () => {
    const r = filtrarCatalogo(servicios, 'perforacion', (s) => s.name)
    expect(r.map((s) => s.id)).toEqual(['1', '2'])
  })

  it('devuelve la lista completa si no hay búsqueda', () => {
    expect(filtrarCatalogo(servicios, '', (s) => s.name)).toHaveLength(3)
  })

  it('devuelve lista vacía si nada coincide', () => {
    expect(filtrarCatalogo(servicios, 'xyz', (s) => s.name)).toEqual([])
  })
})

/**
 * Antes de crear al vuelo hay que detectar que ya existe, aunque venga escrito
 * distinto. Esto evita el error de índice único y, sobre todo, evita que el
 * usuario crea que creó algo nuevo.
 */
describe('encontrarDuplicado', () => {
  const servicios = [
    { id: '1', slug: 'perforacion-de-pozo', name: 'Perforación de pozo' },
    { id: '3', slug: 'bobinado', name: 'Bobinado' },
  ]

  it('encuentra el existente aunque cambie el uso de tildes', () => {
    const r = encontrarDuplicado(servicios, 'Perforacion de Pozo', (s) => s.slug)
    expect(r?.id).toBe('1')
  })

  it('encuentra el existente aunque cambien mayúsculas y espacios', () => {
    expect(encontrarDuplicado(servicios, '  BOBINADO  ', (s) => s.slug)?.id).toBe('3')
  })

  it('devuelve undefined si de verdad es nuevo', () => {
    expect(encontrarDuplicado(servicios, 'Filmación de pozo', (s) => s.slug)).toBeUndefined()
  })

  it('trata la puntuación como separador, igual que el slug', () => {
    expect(encontrarDuplicado(servicios, 'Bobinado.', (s) => s.slug)?.id).toBe('3')
  })
})
