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

describe('el historial en el respaldo', () => {
  const intervencionValida = {
    id: 'i-1',
    wellId: 'p-1',
    performedAt: '2026-03-14',
    servicios: [{ slug: 'limpieza-de-pozo', detail: 'Se sacó arena' }],
    medicion: {
      measuredAt: '2026-03-14',
      staticLevelM: '42.50',
      dynamicLevelM: '58.00',
      bomba: 'grundfos sp 5a-25',
    },
    observaciones: [{ id: 'o-1', body: 'El tablero estaba flojo.' }],
  }

  it('acepta una intervención completa', () => {
    const r = respaldoSchema.safeParse({ version: 2, intervenciones: [intervencionValida] })
    expect(r.success).toBe(true)
  })

  /**
   * Compatibilidad hacia atrás: un archivo de la versión 1 no tiene historial.
   * Si esto se rompe, cada copia que el usuario ya se guardó deja de servir.
   */
  it('acepta un archivo viejo, sin historial', () => {
    const r = respaldoSchema.safeParse({ version: 1, fincas: [], dibujos: [] })
    expect(r.success).toBe(true)
    expect(r.success && r.data.intervenciones).toEqual([])
  })

  it('exige que las fechas sean un día, no una marca de tiempo', () => {
    for (const fecha of ['2026-03-14T10:00:00Z', '14/03/2026', 'ayer', '']) {
      const r = respaldoSchema.safeParse({
        version: 2,
        intervenciones: [{ ...intervencionValida, performedAt: fecha }],
      })
      expect(r.success, fecha).toBe(false)
    }
  })

  /**
   * Los servicios van por SLUG y las bombas por su etiqueta normalizada, no
   * por id: los cuid son distintos en cada base, así que un respaldo que los
   * llevara no se podría importar en otra — que es la mitad del propósito.
   */
  it('el servicio se identifica por slug, no por id', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [{ ...intervencionValida, servicios: [{ slug: '' }] }],
    })
    expect(r.success).toBe(false)
  })

  it('una medición puede no estar: no toda visita mide', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [{ ...intervencionValida, medicion: null }],
    })
    expect(r.success).toBe(true)
  })

  it('una medición puede venir sin bomba y con campos vacíos', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [
        { ...intervencionValida, medicion: { measuredAt: '2026-03-14', bomba: null } },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('rechaza un número que no lo es', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [
        {
          ...intervencionValida,
          medicion: { measuredAt: '2026-03-14', staticLevelM: 'cuarenta' },
        },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('una intervención sin pozo no tiene dónde colgar', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [{ ...intervencionValida, wellId: '' }],
    })
    expect(r.success).toBe(false)
  })
})

describe('reimportar no puede perder datos', () => {
  /**
   * La observación lleva id para poder hacer upsert. Sin id habría que borrar
   * y recrear, y eso se llevaría puesto lo que se agregó después del respaldo
   * —justo lo que este importador promete no hacer—.
   */
  it('la observación exige id', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [
        {
          id: 'i-1',
          wellId: 'p-1',
          performedAt: '2026-03-14',
          observaciones: [{ body: 'sin id' }],
        },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('y no acepta un id vacío, que sería lo mismo que no tenerlo', () => {
    const r = respaldoSchema.safeParse({
      version: 2,
      intervenciones: [
        {
          id: 'i-1',
          wellId: 'p-1',
          performedAt: '2026-03-14',
          observaciones: [{ id: '', body: 'x' }],
        },
      ],
    })
    expect(r.success).toBe(false)
  })
})
