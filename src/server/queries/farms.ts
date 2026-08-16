import 'server-only'

import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'

/**
 * Lecturas de fincas y pozos.
 *
 * REGLA INVIOLABLE: ninguna función de este archivo consulta sin acotar por
 * finca. El acotamiento sale del Actor, nunca de un parámetro que venga del
 * navegador.
 */

/** Fragmento de `where` que limita al alcance del actor. */
async function scopeDeFincas() {
  const actor = await requireActor()

  // ADMIN ve todo; el resto, solo sus membresías. Con farmIds vacío, el
  // `in: []` no matchea nada — que es exactamente lo correcto.
  return actor.role === 'ADMIN' ? {} : { id: { in: actor.farmIds } }
}

export async function listarFincas(busqueda?: string) {
  const scope = await scopeDeFincas()

  return prisma.farm.findMany({
    where: {
      ...scope,
      deletedAt: null,
      ...(busqueda
        ? {
            OR: [
              { name: { contains: busqueda, mode: 'insensitive' as const } },
              { city: { contains: busqueda, mode: 'insensitive' as const } },
              { contactName: { contains: busqueda, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      city: true,
      province: true,
      contactName: true,
      isActive: true,
      _count: { select: { wells: { where: { deletedAt: null } } } },
    },
  })
}

/**
 * Devuelve la finca solo si el actor tiene acceso. `null` en cualquier otro
 * caso — la página lo traduce a 404, sin distinguir "no existe" de "no es tuya".
 */
export async function obtenerFinca(farmId: string) {
  await requireAccess('read', 'farm', farmId)

  return prisma.farm.findFirst({
    where: { id: farmId, deletedAt: null },
    include: {
      wells: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          _count: { select: { interventions: { where: { deletedAt: null } } } },
        },
      },
      members: {
        select: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
      _count: { select: { receipts: { where: { deletedAt: null } } } },
    },
  })
}

export async function obtenerPozo(farmId: string, wellId: string) {
  await requireAccess('read', 'well', farmId)

  // El farmId va en el where, no solo en el guard: aunque alguien pase el
  // wellId de otra finca, la consulta no lo encuentra.
  return prisma.well.findFirst({
    where: { id: wellId, farmId, deletedAt: null },
    include: {
      farm: { select: { id: true, name: true } },
      _count: {
        select: {
          interventions: { where: { deletedAt: null } },
          observations: { where: { deletedAt: null } },
        },
      },
    },
  })
}

/** Fincas donde el actor puede cargar remitos. Alimenta selectores del alta. */
export async function fincasParaSelector() {
  const scope = await scopeDeFincas()

  return prisma.farm.findMany({
    where: { ...scope, deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}
