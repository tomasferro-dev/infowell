import 'server-only'

import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/**
 * Catálogos globales: servicios y electrobombas. No pertenecen a ninguna finca,
 * así que no llevan scope — pero sí exigen sesión.
 */

export type ItemCatalogo = {
  id: string
  label: string
  slug: string
  isSystem: boolean
  isActive: boolean
}

/** Servicios para las cards de intervención. Solo los activos. */
export async function listarServiciosActivos(): Promise<ItemCatalogo[]> {
  await requireAccess('read', 'catalog')

  const servicios = await prisma.serviceType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, icon: true, isSystem: true, isActive: true },
  })

  return servicios.map((s) => ({ ...s, label: s.name }))
}

/** Incluye los desactivados: el admin necesita verlos para reactivarlos. */
export async function listarServiciosTodos() {
  await requireAccess('write', 'catalog')

  return prisma.serviceType.findMany({
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      isSystem: true,
      isActive: true,
      _count: { select: { interventions: true } },
    },
  })
}

export async function listarBombasActivas(): Promise<ItemCatalogo[]> {
  await requireAccess('read', 'catalog')

  const bombas = await prisma.pump.findMany({
    where: { isActive: true },
    orderBy: { label: 'asc' },
    select: { id: true, label: true, normalizedLabel: true, isSystem: true, isActive: true },
  })

  return bombas.map((b) => ({ ...b, slug: b.normalizedLabel }))
}

export async function listarBombasTodas() {
  await requireAccess('write', 'catalog')

  return prisma.pump.findMany({
    orderBy: [{ isActive: 'desc' }, { label: 'asc' }],
    select: {
      id: true,
      label: true,
      normalizedLabel: true,
      brand: true,
      model: true,
      isSystem: true,
      isActive: true,
      _count: { select: { readings: true } },
    },
  })
}
