import { describe, expect, it } from 'vitest'

import { crearFincaSchema, crearPozoSchema, crearUsuarioSchema } from '@/lib/validation/schemas'

/**
 * Los formularios HTML mandan "" para todo campo opcional que el usuario no
 * tocó. Si eso llega crudo a Prisma se guardan cadenas vacías en lugar de NULL,
 * y después "tiene teléfono" es verdadero para media base. La coerción a
 * undefined es la regla que más se repite acá.
 */
describe('crearFincaSchema', () => {
  const base = { name: 'Finca La Esperanza' }

  it('acepta una finca con solo el nombre', () => {
    const r = crearFincaSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('rechaza un nombre vacío o demasiado corto', () => {
    expect(crearFincaSchema.safeParse({ name: '' }).success).toBe(false)
    expect(crearFincaSchema.safeParse({ name: 'A' }).success).toBe(false)
  })

  it('recorta los espacios del nombre', () => {
    const r = crearFincaSchema.parse({ name: '  Finca La Esperanza  ' })
    expect(r.name).toBe('Finca La Esperanza')
  })

  it('convierte los opcionales vacíos en undefined, no en cadena vacía', () => {
    const r = crearFincaSchema.parse({
      ...base,
      address: '',
      contactPhone: '   ',
      contactEmail: '',
      taxId: '',
    })

    expect(r.address).toBeUndefined()
    expect(r.contactPhone).toBeUndefined()
    expect(r.contactEmail).toBeUndefined()
    expect(r.taxId).toBeUndefined()
  })

  it('valida el email de contacto solo si viene cargado', () => {
    expect(crearFincaSchema.safeParse({ ...base, contactEmail: 'no-es-email' }).success).toBe(false)
    expect(crearFincaSchema.safeParse({ ...base, contactEmail: 'juan@campo.com' }).success).toBe(
      true,
    )
  })

  it('normaliza el CUIT sacando guiones y puntos', () => {
    // 30-71234567-1: el 1 final es el dígito verificador correcto (módulo 11).
    const r = crearFincaSchema.parse({ ...base, taxId: '30-71234567-1' })
    expect(r.taxId).toBe('30712345671')
  })

  it('rechaza un CUIT con dígito verificador incorrecto', () => {
    // Mismo CUIT que el anterior pero con el último dígito cambiado.
    expect(crearFincaSchema.safeParse({ ...base, taxId: '30-71234567-9' }).success).toBe(false)
  })

  it('rechaza un CUIT que no tenga 11 dígitos', () => {
    expect(crearFincaSchema.safeParse({ ...base, taxId: '12345' }).success).toBe(false)
  })
})

describe('crearPozoSchema', () => {
  const base = { name: 'Pozo N° 1 - Sector Norte' }

  it('acepta un pozo con solo el nombre', () => {
    expect(crearPozoSchema.safeParse(base).success).toBe(true)
  })

  it('rechaza un nombre vacío', () => {
    expect(crearPozoSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('acepta coordenadas válidas y las deja como número', () => {
    const r = crearPozoSchema.parse({ ...base, latitude: '-32.8895', longitude: '-68.8458' })
    expect(r.latitude).toBeCloseTo(-32.8895)
    expect(r.longitude).toBeCloseTo(-68.8458)
  })

  it('rechaza coordenadas fuera de rango', () => {
    expect(crearPozoSchema.safeParse({ ...base, latitude: '95' }).success).toBe(false)
    expect(crearPozoSchema.safeParse({ ...base, longitude: '-200' }).success).toBe(false)
  })

  it('deja las coordenadas en undefined si vienen vacías', () => {
    const r = crearPozoSchema.parse({ ...base, latitude: '', longitude: '' })
    expect(r.latitude).toBeUndefined()
    expect(r.longitude).toBeUndefined()
  })

  it('rechaza una fecha de perforación futura', () => {
    const futuro = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    expect(crearPozoSchema.safeParse({ ...base, drilledAt: futuro }).success).toBe(false)
  })

  it('acepta una fecha de perforación pasada', () => {
    const r = crearPozoSchema.parse({ ...base, drilledAt: '2019-03-15' })
    expect(r.drilledAt).toBeInstanceOf(Date)
  })
})

describe('crearUsuarioSchema', () => {
  const base = { email: 'juan@campo.com', role: 'CLIENTE' as const, password: 'unaClave123' }

  it('acepta un usuario válido', () => {
    expect(crearUsuarioSchema.safeParse(base).success).toBe(true)
  })

  it('normaliza el email a minúsculas', () => {
    const r = crearUsuarioSchema.parse({ ...base, email: '  Juan@Campo.COM ' })
    expect(r.email).toBe('juan@campo.com')
  })

  it('exige una contraseña de al menos 8 caracteres', () => {
    expect(crearUsuarioSchema.safeParse({ ...base, password: 'corta' }).success).toBe(false)
  })

  it('rechaza un rol inventado', () => {
    expect(crearUsuarioSchema.safeParse({ ...base, role: 'SUPERADMIN' }).success).toBe(false)
  })

  it('acepta una lista de fincas asignadas', () => {
    const r = crearUsuarioSchema.parse({ ...base, farmIds: ['finca-1', 'finca-2'] })
    expect(r.farmIds).toEqual(['finca-1', 'finca-2'])
  })

  it('deja farmIds como lista vacía si no se manda nada', () => {
    const r = crearUsuarioSchema.parse(base)
    expect(r.farmIds).toEqual([])
  })
})
