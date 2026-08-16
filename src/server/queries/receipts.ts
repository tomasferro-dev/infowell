import 'server-only'

import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/**
 * Lecturas de remitos. Siempre acotadas por finca, igual que todo el resto.
 *
 * Los Decimal de Prisma se convierten a number antes de salir: no son
 * serializables hacia Client Components.
 */

export async function listarRemitos(farmId: string, opciones?: { desde?: Date; hasta?: Date }) {
  await requireAccess('read', 'receipt', farmId)

  const where = {
    farmId,
    deletedAt: null,
    ...(opciones?.desde || opciones?.hasta
      ? {
          issueDate: {
            ...(opciones.desde ? { gte: opciones.desde } : {}),
            ...(opciones.hasta ? { lte: opciones.hasta } : {}),
          },
        }
      : {}),
  }

  const [remitos, agregado] = await Promise.all([
    prisma.receipt.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        issueDate: true,
        amount: true,
        currency: true,
        number: true,
        description: true,
        createdBy: { select: { name: true, email: true } },
        photos: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, storagePath: true },
        },
      },
    }),
    // El total lo suma la base, no el servidor: así es correcto aunque más
    // adelante se pagine el listado.
    prisma.receipt.aggregate({ where, _sum: { amount: true }, _count: true }),
  ])

  return {
    remitos: remitos.map((r) => ({
      id: r.id,
      issueDate: r.issueDate.toISOString(),
      amount: Number(r.amount),
      currency: r.currency,
      number: r.number,
      description: r.description,
      autor: r.createdBy.name ?? r.createdBy.email,
      photos: r.photos,
    })),
    total: Number(agregado._sum.amount ?? 0),
    cantidad: agregado._count,
  }
}

export async function obtenerRemito(farmId: string, receiptId: string) {
  await requireAccess('read', 'receipt', farmId)

  const remito = await prisma.receipt.findFirst({
    where: { id: receiptId, farmId, deletedAt: null },
    select: {
      id: true,
      issueDate: true,
      amount: true,
      currency: true,
      number: true,
      description: true,
      createdBy: { select: { name: true, email: true } },
      farm: { select: { id: true, name: true } },
      photos: { orderBy: { sortOrder: 'asc' }, select: { id: true, storagePath: true } },
    },
  })

  if (!remito) return null

  return {
    ...remito,
    issueDate: remito.issueDate.toISOString(),
    amount: Number(remito.amount),
    autor: remito.createdBy.name ?? remito.createdBy.email,
  }
}
