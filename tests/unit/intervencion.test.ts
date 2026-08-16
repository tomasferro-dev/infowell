import { describe, expect, it } from 'vitest'

import { crearIntervencionSchema } from '@/lib/validation/intervencion'

const HOY = new Date().toISOString().slice(0, 10)

/** Payload mínimo válido: una visita con un servicio marcado. */
const base = {
  performedAt: HOY,
  serviceTypeIds: ['srv-1'],
}

describe('crearIntervencionSchema — lo que hace válida una visita', () => {
  it('acepta una visita con solo servicios marcados', () => {
    expect(crearIntervencionSchema.safeParse(base).success).toBe(true)
  })

  it('acepta una visita de control: sin servicios, pero con mediciones', () => {
    const r = crearIntervencionSchema.safeParse({
      performedAt: HOY,
      serviceTypeIds: [],
      depthM: '42.5',
    })
    expect(r.success).toBe(true)
  })

  it('acepta una visita sin servicios pero con una observación escrita', () => {
    const r = crearIntervencionSchema.safeParse({
      performedAt: HOY,
      serviceTypeIds: [],
      observations: 'Se revisó el tablero, quedó todo en orden.',
    })
    expect(r.success).toBe(true)
  })

  it('RECHAZA un submit completamente vacío', () => {
    // Sin esto se llenaría el historial de intervenciones fantasma, con fecha
    // y sin ninguna información.
    const r = crearIntervencionSchema.safeParse({ performedAt: HOY, serviceTypeIds: [] })
    expect(r.success).toBe(false)
  })

  it('ignora una observación que es solo espacios', () => {
    const r = crearIntervencionSchema.safeParse({
      performedAt: HOY,
      serviceTypeIds: [],
      observations: '    ',
    })
    expect(r.success).toBe(false)
  })
})

describe('crearIntervencionSchema — fecha del trabajo', () => {
  it('exige la fecha', () => {
    expect(crearIntervencionSchema.safeParse({ ...base, performedAt: '' }).success).toBe(false)
  })

  it('rechaza una fecha futura', () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(crearIntervencionSchema.safeParse({ ...base, performedAt: manana }).success).toBe(false)
  })

  it('acepta una fecha pasada: se cargan visitas viejas', () => {
    const r = crearIntervencionSchema.parse({ ...base, performedAt: '2023-07-04' })
    expect(r.performedAt).toBeInstanceOf(Date)
  })
})

describe('crearIntervencionSchema — mediciones técnicas', () => {
  it('deja en undefined las mediciones que no se cargaron', () => {
    const r = crearIntervencionSchema.parse({
      ...base,
      depthM: '',
      pumpDepthM: '',
      flowRateM3H: '',
    })

    expect(r.depthM).toBeUndefined()
    expect(r.pumpDepthM).toBeUndefined()
    expect(r.flowRateM3H).toBeUndefined()
  })

  it('acepta coma decimal, que es lo que tipea el teclado en español', () => {
    const r = crearIntervencionSchema.parse({ ...base, depthM: '42,5' })
    expect(r.depthM).toBeCloseTo(42.5)
  })

  it('rechaza profundidades negativas', () => {
    expect(crearIntervencionSchema.safeParse({ ...base, depthM: '-5' }).success).toBe(false)
  })

  it('rechaza valores absurdamente grandes', () => {
    expect(crearIntervencionSchema.safeParse({ ...base, depthM: '99999' }).success).toBe(false)
  })

  it('rechaza texto donde va un número', () => {
    expect(crearIntervencionSchema.safeParse({ ...base, flowRateM3H: 'mucho' }).success).toBe(false)
  })

  /**
   * El nivel dinámico se mide con la bomba funcionando, así que el agua está
   * SIEMPRE más abajo que en reposo. Si viene al revés, casi seguro se
   * cargaron los campos cruzados.
   */
  it('rechaza un nivel dinámico más somero que el estático', () => {
    const r = crearIntervencionSchema.safeParse({
      ...base,
      staticLevelM: '30',
      dynamicLevelM: '18',
    })
    expect(r.success).toBe(false)
  })

  it('acepta niveles coherentes', () => {
    const r = crearIntervencionSchema.safeParse({
      ...base,
      staticLevelM: '18',
      dynamicLevelM: '30',
    })
    expect(r.success).toBe(true)
  })

  it('acepta niveles iguales: pozo sin abatimiento medible', () => {
    const r = crearIntervencionSchema.safeParse({
      ...base,
      staticLevelM: '18',
      dynamicLevelM: '18',
    })
    expect(r.success).toBe(true)
  })

  it('no compara niveles si solo se cargó uno de los dos', () => {
    expect(crearIntervencionSchema.safeParse({ ...base, dynamicLevelM: '30' }).success).toBe(true)
    expect(crearIntervencionSchema.safeParse({ ...base, staticLevelM: '30' }).success).toBe(true)
  })
})

describe('crearIntervencionSchema — servicios y bomba', () => {
  it('descarta ids repetidos de servicio', () => {
    const r = crearIntervencionSchema.parse({ ...base, serviceTypeIds: ['a', 'b', 'a'] })
    expect(r.serviceTypeIds).toEqual(['a', 'b'])
  })

  it('acepta un id de electrobomba', () => {
    const r = crearIntervencionSchema.parse({ ...base, pumpId: 'bomba-1' })
    expect(r.pumpId).toBe('bomba-1')
  })

  it('deja la bomba en undefined si no se eligió ninguna', () => {
    const r = crearIntervencionSchema.parse({ ...base, pumpId: '' })
    expect(r.pumpId).toBeUndefined()
  })
})
