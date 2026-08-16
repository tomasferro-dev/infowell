import { describe, expect, it } from 'vitest'

import { crearRemitoSchema, parsearMonto } from '@/lib/validation/remito'

const HOY = new Date().toISOString().slice(0, 10)

/**
 * El monto lo tipea el operario en el celular, con el teclado numérico y a las
 * apuradas. En es-AR el punto separa miles y la coma decimales, pero el teclado
 * del teléfono ofrece el punto — así que llegan las dos convenciones mezcladas.
 * Interpretar mal esto no rompe la app: escribe un número equivocado en un
 * registro contable.
 */
describe('parsearMonto', () => {
  it('interpreta el formato argentino con coma decimal', () => {
    expect(parsearMonto('15000,50')).toBe(15000.5)
    expect(parsearMonto('0,75')).toBe(0.75)
  })

  it('interpreta el punto como separador de miles', () => {
    expect(parsearMonto('15.000')).toBe(15000)
    expect(parsearMonto('1.500.000')).toBe(1500000)
  })

  it('combina puntos de miles con coma decimal', () => {
    expect(parsearMonto('1.500.000,25')).toBe(1500000.25)
  })

  it('acepta el punto decimal que ofrece el teclado del celular', () => {
    // El último grupo tiene 2 dígitos: no puede ser un separador de miles.
    expect(parsearMonto('15000.50')).toBe(15000.5)
    expect(parsearMonto('0.75')).toBe(0.75)
  })

  it('ignora el símbolo de peso y los espacios', () => {
    expect(parsearMonto('$ 15.000,50')).toBe(15000.5)
    expect(parsearMonto('  1500  ')).toBe(1500)
  })

  it('devuelve null si no hay un número interpretable', () => {
    expect(parsearMonto('')).toBeNull()
    expect(parsearMonto('mucha plata')).toBeNull()
    expect(parsearMonto('$')).toBeNull()
  })
})

describe('crearRemitoSchema', () => {
  const base = { issueDate: HOY, amount: '15000,50' }

  it('acepta un remito con fecha y monto', () => {
    const r = crearRemitoSchema.parse(base)
    expect(r.amount).toBe(15000.5)
    expect(r.issueDate).toBeInstanceOf(Date)
  })

  it('exige la fecha', () => {
    expect(crearRemitoSchema.safeParse({ ...base, issueDate: '' }).success).toBe(false)
  })

  it('exige el monto: es obligatorio por requerimiento', () => {
    expect(crearRemitoSchema.safeParse({ ...base, amount: '' }).success).toBe(false)
  })

  it('rechaza un monto negativo o cero', () => {
    expect(crearRemitoSchema.safeParse({ ...base, amount: '-100' }).success).toBe(false)
    expect(crearRemitoSchema.safeParse({ ...base, amount: '0' }).success).toBe(false)
  })

  it('rechaza un monto que no es un número', () => {
    expect(crearRemitoSchema.safeParse({ ...base, amount: 'mucho' }).success).toBe(false)
  })

  it('rechaza una fecha futura', () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(crearRemitoSchema.safeParse({ ...base, issueDate: manana }).success).toBe(false)
  })

  it('deja en undefined los opcionales vacíos', () => {
    const r = crearRemitoSchema.parse({ ...base, number: '', description: '  ' })
    expect(r.number).toBeUndefined()
    expect(r.description).toBeUndefined()
  })

  it('acepta las fotos como lista de rutas', () => {
    const r = crearRemitoSchema.parse({
      ...base,
      photos: ['finca-1/draft-1/a.jpg', 'finca-1/draft-1/b.jpg'],
    })
    expect(r.photos).toHaveLength(2)
  })

  it('funciona sin fotos: el remito se puede cargar y adjuntar después', () => {
    expect(crearRemitoSchema.parse(base).photos).toEqual([])
  })
})
