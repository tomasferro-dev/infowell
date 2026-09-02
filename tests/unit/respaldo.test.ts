import { describe, expect, it } from 'vitest'

import { nombreDeArchivo, respaldoSchema, VERSION_RESPALDO } from '@/lib/respaldo'

const minimo = {
  version: VERSION_RESPALDO,
  fincas: [{ id: 'f1', name: 'Bodega Alto Cerro', pozos: [] }],
  dibujos: [],
}

describe('formato del respaldo', () => {
  it('acepta un archivo mínimo', () => {
    const r = respaldoSchema.safeParse(minimo)

    expect(r.success).toBe(true)
    expect(r.data?.fincas[0]?.pozos).toEqual([])
  })

  it('rechaza un archivo sin versión: no se sabría cómo leerlo', () => {
    expect(respaldoSchema.safeParse({ fincas: [], dibujos: [] }).success).toBe(false)
  })

  it('rechaza una finca sin nombre', () => {
    const r = respaldoSchema.safeParse({ ...minimo, fincas: [{ id: 'f1', name: '  ', pozos: [] }] })

    expect(r.success).toBe(false)
  })

  it('rechaza una coordenada que no es número', () => {
    const conBasura = {
      ...minimo,
      fincas: [{ id: 'f1', name: 'X', latitude: 'no-es', pozos: [] }],
    }

    expect(respaldoSchema.safeParse(conBasura).success).toBe(false)
  })

  it('acepta coordenadas nulas: una finca puede no estar ubicada', () => {
    const sinUbicar = {
      ...minimo,
      fincas: [{ id: 'f1', name: 'X', latitude: null, longitude: null, pozos: [] }],
    }

    expect(respaldoSchema.safeParse(sinUbicar).success).toBe(true)
  })

  it('exige que la fecha de perforación sea un día, no una marca de tiempo', () => {
    const conHora = {
      ...minimo,
      fincas: [
        { id: 'f1', name: 'X', pozos: [{ id: 'p1', name: 'P', drilledAt: '2020-01-01T00:00:00Z' }] },
      ],
    }

    expect(respaldoSchema.safeParse(conHora).success).toBe(false)
    expect(
      respaldoSchema.safeParse({
        ...minimo,
        fincas: [{ id: 'f1', name: 'X', pozos: [{ id: 'p1', name: 'P', drilledAt: '2020-01-01' }] }],
      }).success,
    ).toBe(true)
  })

  it('rechaza una forma de dibujo que no existe', () => {
    const raro = {
      ...minimo,
      dibujos: [{ id: 'd1', kind: 'CIRCULO', color: 'rojo', filled: false, geometry: [] }],
    }

    expect(respaldoSchema.safeParse(raro).success).toBe(false)
  })

  it('acepta un dibujo suelto, sin finca ni pozo', () => {
    const suelto = {
      ...minimo,
      dibujos: [
        { id: 'd1', farmId: null, wellId: null, kind: 'PUNTO', color: 'rojo', filled: false, geometry: [-68, -33] },
      ],
    }

    expect(respaldoSchema.safeParse(suelto).success).toBe(true)
  })

  it('el nombre del archivo lleva la fecha, para no pisar copias', () => {
    expect(nombreDeArchivo(new Date('2026-09-02T10:00:00Z'))).toBe(
      'infowell-respaldo-2026-09-02.json',
    )
  })
})
