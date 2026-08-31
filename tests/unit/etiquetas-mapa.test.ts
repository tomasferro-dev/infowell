import { describe, expect, it } from 'vitest'

import { inicialesDeFinca, numerarPozos } from '@/lib/etiquetas-mapa'

describe('iniciales de una finca', () => {
  it('toma la inicial de las dos primeras palabras con contenido', () => {
    expect(inicialesDeFinca('Bodega Alto Cerro')).toBe('BA')
    expect(inicialesDeFinca('Los Alamos del Sur')).toBe('AS')
  })

  it('ignora conectores, que no distinguen una finca de otra', () => {
    expect(inicialesDeFinca('Finca de los Andes')).toBe('FA')
    expect(inicialesDeFinca('La Escondida')).toBe('ES')
  })

  it('con una sola palabra usa sus dos primeras letras', () => {
    expect(inicialesDeFinca('Peñaflor')).toBe('PE')
  })

  it('quita tildes: el rótulo tiene que entrar en el pin', () => {
    expect(inicialesDeFinca('Ñandú Álamo')).toBe('NA')
  })

  it('no se rompe con nombres raros', () => {
    expect(inicialesDeFinca('   ')).toBe('??')
    expect(inicialesDeFinca('123 - 456')).toBe('14')
    // Un nombre hecho SOLO de conectores igual tiene que rotularse.
    expect(inicialesDeFinca('La Los')).toBe('LL')
  })

  it('normaliza separadores que no son espacios', () => {
    expect(inicialesDeFinca('Agro-Riego S.R.L.')).toBe('AR')
  })
})

describe('numeración de pozos', () => {
  const pozo = (id: string, carga: string, perforacion: string | null) => ({
    id,
    createdAt: new Date(carga),
    drilledAt: perforacion === null ? null : new Date(perforacion),
  })

  it('por orden de carga, sin mirar la fecha de perforación', () => {
    const numeros = numerarPozos(
      [
        pozo('c', '2026-03-01', '2000-01-01'),
        pozo('a', '2026-01-01', '2024-01-01'),
        pozo('b', '2026-02-01', '2010-01-01'),
      ],
      'carga',
    )

    expect(numeros.get('a')).toBe(1)
    expect(numeros.get('b')).toBe(2)
    expect(numeros.get('c')).toBe(3)
  })

  it('por fecha de perforación, que puede ser el orden inverso', () => {
    const numeros = numerarPozos(
      [
        pozo('nuevo', '2026-01-01', '2024-01-01'),
        pozo('viejo', '2026-03-01', '1998-01-01'),
      ],
      'perforacion',
    )

    // El pozo cargado último es el más antiguo: por perforación va primero.
    expect(numeros.get('viejo')).toBe(1)
    expect(numeros.get('nuevo')).toBe(2)
  })

  it('los que no tienen fecha de perforación van al final', () => {
    const numeros = numerarPozos(
      [
        pozo('sinfecha', '2026-01-01', null),
        pozo('confecha', '2026-02-01', '2020-01-01'),
      ],
      'perforacion',
    )

    // Si fueran primeros correrían la numeración de los que sí tienen dato.
    expect(numeros.get('confecha')).toBe(1)
    expect(numeros.get('sinfecha')).toBe(2)
  })

  it('empata por orden de carga cuando la perforación es el mismo día', () => {
    const numeros = numerarPozos(
      [
        pozo('segundo', '2026-02-01', '2020-05-05'),
        pozo('primero', '2026-01-01', '2020-05-05'),
      ],
      'perforacion',
    )

    expect(numeros.get('primero')).toBe(1)
    expect(numeros.get('segundo')).toBe(2)
  })

  it('el orden es estable con cargas idénticas, o el número bailaría', () => {
    const mismos = [pozo('bbb', '2026-01-01', null), pozo('aaa', '2026-01-01', null)]

    const uno = numerarPozos(mismos, 'carga')
    const dos = numerarPozos([...mismos].reverse(), 'carga')

    expect(uno.get('aaa')).toBe(dos.get('aaa'))
    expect(uno.get('bbb')).toBe(dos.get('bbb'))
  })

  it('numera desde 1 y sin huecos', () => {
    const numeros = numerarPozos(
      ['a', 'b', 'c', 'd'].map((id, i) => pozo(id, `2026-0${i + 1}-01`, null)),
      'carga',
    )

    expect([...numeros.values()].sort()).toEqual([1, 2, 3, 4])
  })
})
