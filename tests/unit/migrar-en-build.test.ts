import { describe, expect, it } from 'vitest'

import { debeMigrar } from '../../scripts/migrar-en-build'

/**
 * Quién puede migrar la base desde el build.
 *
 * Se prueba la decisión, no el build: lo que importa es que un deploy de
 * preview NUNCA migre. Preview y Production comparten las variables en el
 * panel de Vercel, así que un preview apunta a la base del cliente; si
 * migrara, cualquier rama con un `schema.prisma` a medio hacer le cambiaría
 * el esquema a los datos reales.
 */

describe('quién migra en el build', () => {
  it('migra en el deploy de producción de Vercel', () => {
    expect(debeMigrar({ VERCEL_ENV: 'production' })).toBe(true)
  })

  it('NO migra en un deploy de preview', () => {
    expect(debeMigrar({ VERCEL_ENV: 'preview' })).toBe(false)
  })

  it('NO migra en el entorno de desarrollo de Vercel', () => {
    expect(debeMigrar({ VERCEL_ENV: 'development' })).toBe(false)
  })

  /**
   * `npm run build` en la máquina de uno no tiene VERCEL_ENV, y el `.env`
   * local es producción: migrar ahí sería tocar los datos del cliente desde
   * una verificación de build.
   */
  it('NO migra fuera de Vercel', () => {
    expect(debeMigrar({})).toBe(false)
    expect(debeMigrar({ VERCEL_ENV: undefined })).toBe(false)
  })

  /** Ante cualquier valor que no reconoce, no migra. */
  it('NO migra ante un valor inesperado', () => {
    expect(debeMigrar({ VERCEL_ENV: 'Production' })).toBe(false)
    expect(debeMigrar({ VERCEL_ENV: '' })).toBe(false)
    expect(debeMigrar({ VERCEL_ENV: 'staging' })).toBe(false)
  })
})
