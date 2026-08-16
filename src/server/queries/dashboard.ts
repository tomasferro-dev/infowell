import 'server-only'

import { prisma } from '@/server/db'
import { requireActor } from '@/server/guards'

/**
 * Datos del inicio, ya acotados al alcance del actor.
 *
 * Se arma acá y no en la página para que el filtro por finca viva en un solo
 * lugar: `alcance()` es la única fuente del `where`, y todo lo demás lo usa.
 */

/** Fragmento de where por finca. `null` significa ADMIN (sin restricción). */
async function alcance() {
  const actor = await requireActor()
  return {
    actor,
    farmIds: actor.role === 'ADMIN' ? null : actor.farmIds,
  }
}

export async function datosDelInicio() {
  const { actor, farmIds } = await alcance()

  // Con farmIds vacío, el `in: []` no matchea nada — que es lo correcto para
  // un usuario al que todavía no le asignaron fincas.
  const porFinca = farmIds === null ? {} : { farmId: { in: farmIds } }
  const fincaPropia = farmIds === null ? {} : { id: { in: farmIds } }

  const [fincas, remitos, montoTotal, ultimasIntervenciones, ultimosRemitos] = await Promise.all([
    prisma.farm.count({ where: { ...fincaPropia, deletedAt: null } }),

    prisma.receipt.count({ where: { ...porFinca, deletedAt: null } }),

    prisma.receipt.aggregate({
      where: { ...porFinca, deletedAt: null },
      _sum: { amount: true },
    }),

    prisma.intervention.findMany({
      where: {
        deletedAt: null,
        well: { deletedAt: null, ...(farmIds === null ? {} : { farmId: { in: farmIds } }) },
      },
      orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        performedAt: true,
        well: {
          select: { id: true, name: true, farm: { select: { id: true, name: true } } },
        },
        services: { select: { serviceType: { select: { id: true, name: true } } } },
      },
    }),

    prisma.receipt.findMany({
      where: { ...porFinca, deletedAt: null },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        issueDate: true,
        amount: true,
        currency: true,
        farm: { select: { id: true, name: true } },
      },
    }),
  ])

  return {
    rol: actor.role,
    fincas,
    remitos,
    // Decimal no cruza a Client Components: se convierte acá.
    montoTotal: Number(montoTotal._sum.amount ?? 0),
    ultimasIntervenciones: ultimasIntervenciones.map((i) => ({
      id: i.id,
      performedAt: i.performedAt.toISOString(),
      pozo: i.well,
      servicios: i.services.map((s) => s.serviceType.name),
    })),
    ultimosRemitos: ultimosRemitos.map((r) => ({
      id: r.id,
      issueDate: r.issueDate.toISOString(),
      amount: Number(r.amount),
      currency: r.currency,
      finca: r.farm,
    })),
  }
}

/** Fincas del cargador, para el atajo directo de carga. */
export async function fincasDelCargador() {
  const { actor, farmIds } = await alcance()
  if (actor.role !== 'CARGADOR') return []

  return prisma.farm.findMany({
    where: { id: { in: farmIds ?? [] }, deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}
