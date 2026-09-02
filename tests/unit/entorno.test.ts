import { describe, expect, it } from 'vitest'

import { proyectoDe, verificarSeparacion } from '../../scripts/entorno'

/**
 * La traba que impide correr los tests contra la base del cliente.
 *
 * Se prueba la decisión, no los archivos: lo que importa es que corte en los
 * casos que corresponde. Un guardián que no se verifica no es un guardián, es
 * una intención.
 */

const URL_DEV = 'postgresql://postgres.abcdefdev:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
const URL_PROD = 'postgresql://postgres.erdpbfcidqxfcxahnwjp:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

describe('a qué proyecto apunta una URL', () => {
  it('saca la referencia del usuario del pooler', () => {
    expect(proyectoDe(URL_PROD)).toBe('erdpbfcidqxfcxahnwjp')
    expect(proyectoDe(URL_DEV)).toBe('abcdefdev')
  })

  it('devuelve null cuando no hay de dónde sacarla', () => {
    expect(proyectoDe(undefined)).toBeNull()
    expect(proyectoDe('no es una url')).toBeNull()
    // Conexión directa: el usuario es «postgres» pelado, sin referencia.
    expect(proyectoDe('postgresql://postgres:clave@db.algo.supabase.co:5432/postgres')).toBeNull()
  })
})

describe('la traba de separación', () => {
  it('corta si no hay base de desarrollo configurada', () => {
    expect(() => verificarSeparacion('prod', null)).toThrow(/Falta \.env\.test/)
  })

  it('corta si desarrollo y producción son el mismo proyecto', () => {
    expect(() => verificarSeparacion('mismo', 'mismo')).toThrow(/MISMO proyecto/)
  })

  it('deja pasar cuando son distintos', () => {
    expect(() => verificarSeparacion('prod', 'dev')).not.toThrow()
  })

  it('deja pasar si no se pudo leer producción: no hay contra qué comparar', () => {
    // Un .env ausente o raro no debería trabar el trabajo en desarrollo.
    expect(() => verificarSeparacion(null, 'dev')).not.toThrow()
  })

  it('el mensaje dice qué hacer, no solo que algo está mal', () => {
    try {
      verificarSeparacion('prod', null)
      expect.unreachable('tendría que haber cortado')
    } catch (e) {
      const mensaje = (e as Error).message
      expect(mensaje).toContain('DATABASE_URL')
      expect(mensaje).toContain('DEPLOY.md')
      expect(mensaje).toContain('El .env no se toca')
    }
  })
})
