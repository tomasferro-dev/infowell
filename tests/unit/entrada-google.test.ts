import { describe, expect, it } from 'vitest'

import { puedeEntrarPorGoogle } from '@/server/entrada-google'

/**
 * Quién puede entrar con Google.
 *
 * Es una LISTA BLANCA: el email tiene que estar ya dado de alta en la app. Sin
 * esto, cargar las credenciales de OAuth abriría la app a cualquiera con una
 * cuenta de Google —o sea, a cualquiera—, y acá hay datos de fincas de
 * clientes distintos.
 */

describe('entrada por Google', () => {
  it('deja entrar cuando hay UNA cuenta y está activa', () => {
    expect(puedeEntrarPorGoogle([{ email: 'nahuel@arenas.com.ar', isActive: true }])).toBe(true)
  })

  it('NO deja entrar a un email que no está dado de alta', () => {
    expect(puedeEntrarPorGoogle([])).toBe(false)
  })

  /**
   * Un usuario desactivado no entra por ninguna puerta. Si entrara por Google,
   * desactivarlo no serviría de nada: alcanzaría con cambiar de botón.
   */
  it('NO deja entrar a un usuario dado de baja', () => {
    expect(puedeEntrarPorGoogle([{ email: 'ex@arenas.com.ar', isActive: false }])).toBe(false)
  })

  it('NO deja entrar sin email: no hay contra qué comparar', () => {
    expect(puedeEntrarPorGoogle([{ email: null, isActive: true }])).toBe(false)
    expect(puedeEntrarPorGoogle([{ email: '', isActive: true }])).toBe(false)
  })

  /**
   * La búsqueda es insensible a mayúsculas porque los emails se guardan tal
   * como se escriben. Eso abre un caso raro pero posible: dos filas que solo
   * difieren en mayúsculas. Ahí no se puede saber a cuál de las dos personas
   * corresponde la cuenta de Google, y una puerta que adivina no es una
   * puerta — se niega.
   */
  it('NO deja entrar si hay dos cuentas que solo difieren en mayúsculas', () => {
    expect(
      puedeEntrarPorGoogle([
        { email: 'Ana@arenas.com.ar', isActive: true },
        { email: 'ana@arenas.com.ar', isActive: true },
      ]),
    ).toBe(false)
  })

  it('tampoco si una de las dos está dada de baja', () => {
    expect(
      puedeEntrarPorGoogle([
        { email: 'Ana@arenas.com.ar', isActive: true },
        { email: 'ana@arenas.com.ar', isActive: false },
      ]),
    ).toBe(false)
  })
})
