import 'server-only'

import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/** Listado de usuarios. Exclusivo del admin. */
export async function listarUsuarios() {
  await requireAccess('read', 'user')

  return prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { email: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      _count: { select: { memberships: true } },
    },
  })
}

export async function obtenerUsuario(userId: string) {
  await requireAccess('read', 'user')

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      memberships: { select: { farmId: true } },
    },
  })

  if (!usuario) return null

  return { ...usuario, farmIds: usuario.memberships.map((m) => m.farmId) }
}

/** Todas las fincas, para el selector de asignación. Solo admin. */
export async function fincasParaAsignar() {
  await requireAccess('write', 'user')

  return prisma.farm.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}
