'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { interpretarRuta } from '@/lib/storage-paths'
import { crearRemitoSchema } from '@/lib/validation/remito'
import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

import type { FormState } from '@/server/actions/farms'

function erroresDeCampo(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const campo = String(issue.path[0] ?? '')
    if (campo && !out[campo]) out[campo] = issue.message
  }
  return out
}

export async function crearRemitoAction(
  farmId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAccess('write', 'receipt', farmId)

  const parsed = crearRemitoSchema.safeParse({
    ...Object.fromEntries(formData),
    photos: formData.getAll('photos').filter((v): v is string => typeof v === 'string' && v !== ''),
  })

  if (!parsed.success) {
    return {
      error: parsed.error.issues.find((i) => i.path.length === 0)?.message ?? 'Revisá los datos',
      fieldErrors: erroresDeCampo(parsed.error.issues),
    }
  }

  const { photos, ...datos } = parsed.data

  // Las rutas las generó el servidor al firmar, pero vuelven desde el
  // navegador: se revalida que TODAS apunten a esta finca antes de guardarlas.
  for (const ruta of photos) {
    const partes = interpretarRuta(ruta)
    if (!partes || partes.farmId !== farmId) {
      return { error: 'Alguna de las fotos no es válida' }
    }
  }

  await prisma.receipt.create({
    data: {
      ...datos,
      farmId,
      createdById: actor.id,
      photos: {
        // sortOrder preserva el orden que eligió el usuario en la grilla.
        create: photos.map((storagePath, i) => ({
          storagePath,
          mimeType: 'image/jpeg',
          sortOrder: i,
        })),
      },
    },
  })

  revalidatePath(`/fincas/${farmId}/remitos`)
  revalidatePath(`/fincas/${farmId}`)
  redirect(`/fincas/${farmId}/remitos`)
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
