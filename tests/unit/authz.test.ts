import { describe, expect, it } from 'vitest'

import { authorize, type Actor } from '@/server/authz'

/**
 * Esta es la prueba más importante del proyecto: describe quién puede ver y
 * tocar qué. Una regresión acá no rompe una pantalla — filtra los datos de una
 * finca a otro cliente.
 *
 * Convención de los actores de prueba: FINCA_A es la finca "propia" del actor,
 * FINCA_B es ajena.
 */
const FINCA_A = 'finca-a'
const FINCA_B = 'finca-b'

const admin: Actor = { id: 'u-admin', role: 'ADMIN', farmIds: [], isActive: true }
const cargador: Actor = { id: 'u-carg', role: 'CARGADOR', farmIds: [FINCA_A], isActive: true }
const cliente: Actor = { id: 'u-cli', role: 'CLIENTE', farmIds: [FINCA_A], isActive: true }

describe('authorize — ADMIN', () => {
  it('lee y escribe cualquier recurso de cualquier finca', () => {
    expect(authorize(admin, 'read', 'intervention', FINCA_B)).toBe(true)
    expect(authorize(admin, 'write', 'intervention', FINCA_B)).toBe(true)
    expect(authorize(admin, 'write', 'receipt', FINCA_A)).toBe(true)
  })

  it('es el único que gestiona usuarios y catálogos', () => {
    expect(authorize(admin, 'write', 'user')).toBe(true)
    expect(authorize(admin, 'write', 'catalog')).toBe(true)
    expect(authorize(cargador, 'write', 'user')).toBe(false)
    expect(authorize(cliente, 'write', 'user')).toBe(false)
  })

  it('no necesita membresía: su lista de fincas está vacía a propósito', () => {
    expect(admin.farmIds).toHaveLength(0)
    expect(authorize(admin, 'read', 'farm', 'finca-que-nunca-vio')).toBe(true)
  })
})

describe('authorize — CLIENTE (solo lectura, solo su finca)', () => {
  it('lee los recursos de su propia finca', () => {
    for (const recurso of ['farm', 'well', 'intervention', 'reading', 'observation', 'receipt'] as const) {
      expect(authorize(cliente, 'read', recurso, FINCA_A), recurso).toBe(true)
    }
  })

  it('NO lee nada de una finca ajena', () => {
    for (const recurso of ['farm', 'well', 'intervention', 'reading', 'observation', 'receipt'] as const) {
      expect(authorize(cliente, 'read', recurso, FINCA_B), recurso).toBe(false)
    }
  })

  it('NO escribe nada, ni siquiera en su propia finca', () => {
    for (const recurso of ['farm', 'well', 'intervention', 'reading', 'observation', 'receipt'] as const) {
      expect(authorize(cliente, 'write', recurso, FINCA_A), recurso).toBe(false)
    }
  })
})

describe('authorize — CARGADOR (escribe remitos, nada más)', () => {
  it('escribe remitos en las fincas que tiene asignadas', () => {
    expect(authorize(cargador, 'write', 'receipt', FINCA_A)).toBe(true)
  })

  it('NO escribe remitos en una finca que no tiene asignada', () => {
    expect(authorize(cargador, 'write', 'receipt', FINCA_B)).toBe(false)
  })

  it('NO escribe intervenciones, mediciones ni observaciones', () => {
    for (const recurso of ['farm', 'well', 'intervention', 'reading', 'observation'] as const) {
      expect(authorize(cargador, 'write', recurso, FINCA_A), recurso).toBe(false)
    }
  })

  it('lee los datos de su finca para poder elegirla al cargar', () => {
    expect(authorize(cargador, 'read', 'farm', FINCA_A)).toBe(true)
    expect(authorize(cargador, 'read', 'receipt', FINCA_A)).toBe(true)
  })
})

describe('authorize — reglas transversales (fail-closed)', () => {
  it('niega todo a un usuario desactivado, cualquiera sea su rol', () => {
    const adminSuspendido: Actor = { ...admin, isActive: false }
    const clienteSuspendido: Actor = { ...cliente, isActive: false }

    expect(authorize(adminSuspendido, 'read', 'farm', FINCA_A)).toBe(false)
    expect(authorize(adminSuspendido, 'write', 'user')).toBe(false)
    expect(authorize(clienteSuspendido, 'read', 'farm', FINCA_A)).toBe(false)
  })

  it('niega el acceso a un recurso de finca si no se indica la finca', () => {
    // Una query que se olvida de pasar farmId no debe pasar "por defecto":
    // ese olvido es exactamente como se filtran datos entre clientes.
    expect(authorize(cliente, 'read', 'well', undefined)).toBe(false)
    expect(authorize(cargador, 'write', 'receipt', undefined)).toBe(false)
  })

  it('un usuario sin fincas asignadas no ve nada', () => {
    const huerfano: Actor = { id: 'u-x', role: 'CLIENTE', farmIds: [], isActive: true }

    expect(authorize(huerfano, 'read', 'farm', FINCA_A)).toBe(false)
  })

  it('el catálogo de servicios se lee autenticado, pero solo el admin lo edita', () => {
    expect(authorize(cliente, 'read', 'catalog')).toBe(true)
    expect(authorize(cargador, 'read', 'catalog')).toBe(true)
    expect(authorize(cliente, 'write', 'catalog')).toBe(false)
  })
})
