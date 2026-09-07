'use server'

import { revalidatePath } from 'next/cache'

import { interpretarRuta } from '@/lib/storage-paths'
import { crearRemitoSchema } from '@/lib/validation/remito'
import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/**
 * Guarda un remito ya con sus fotos subidas.
 *
 * Existe aparte de `crearRemitoAction` porque NO redirige: la llama la cola de
 * remitos pendientes, que corre en segundo plano y no está navegando a ningún
 * lado. Un `redirect()` ahí tiraría una excepción dentro del reintento.
 *
 * Las dos comparten esta función para validar y guardar: un camino de reintento
 * distinto del camino en vivo se pudre sin que nadie lo note, porque casi nunca
 * se ejecuta.
 */
export async function guardarRemitoAction(
  farmId: string,
  campos: Record<string, string>,
  photos: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAccess('write', 'receipt', farmId)

  const parsed = crearRemitoSchema.safeParse({ ...campos, photos })

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues.find((i) => i.path.length === 0)?.message ??
        parsed.error.issues[0]?.message ??
        'Revisá los datos',
    }
  }

  const { photos: rutas, ...datos } = parsed.data

  // Las rutas las generó el servidor al firmar, pero vuelven desde el
  // navegador: se revalida que TODAS apunten a esta finca antes de guardarlas.
  for (const ruta of rutas) {
    const partes = interpretarRuta(ruta)
    if (!partes || partes.farmId !== farmId) {
      return { ok: false, error: 'Alguna de las fotos no es válida' }
    }
  }

  await prisma.receipt.create({
    data: {
      ...datos,
      farmId,
      createdById: actor.id,
      photos: {
        // sortOrder preserva el orden que eligió el usuario en la grilla.
        create: rutas.map((storagePath, i) => ({
          storagePath,
          mimeType: 'image/jpeg',
          sortOrder: i,
        })),
      },
    },
  })

  revalidatePath(`/fincas/${farmId}/remitos`)
  revalidatePath(`/fincas/${farmId}`)

  return { ok: true }
}

export async function archivarRemitoAction(farmId: string, receiptId: string) {
  await requireAccess('write', 'receipt', farmId)

  // El farmId en el where impide archivar el remito de otra finca.
  await prisma.receipt.updateMany({
    where: { id: receiptId, farmId, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  revalidatePath(`/fincas/${farmId}/remitos`)
}
