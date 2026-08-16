'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { interpretarRuta } from '@/lib/storage-paths'
import { crearIntervencionSchema } from '@/lib/validation/intervencion'
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

/**
 * Crea la intervención con sus tres módulos en UNA transacción.
 *
 * Es indivisible a propósito: una intervención cuyos servicios se guardaron
 * pero cuyas mediciones se perdieron es peor que un error — el técnico ya se
 * fue del campo y nadie se entera de que faltan datos.
 */
export async function crearIntervencionAction(
  farmId: string,
  wellId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAccess('write', 'intervention', farmId)

  const parsed = crearIntervencionSchema.safeParse({
    ...Object.fromEntries(formData),
    // getAll: las cards marcadas mandan el mismo campo repetido.
    serviceTypeIds: formData.getAll('serviceTypeIds').filter((v): v is string => typeof v === 'string'),
    voiceNotes: formData.getAll('voiceNotes').filter((v): v is string => typeof v === 'string'),
  })

  if (!parsed.success) {
    const fieldErrors = erroresDeCampo(parsed.error.issues)
    return {
      // El error del refine general no tiene path: se muestra como error global.
      error: parsed.error.issues.find((i) => i.path.length === 0)?.message ?? 'Revisá los datos',
      fieldErrors,
    }
  }

  const { serviceTypeIds, observations, performedAt, pumpId, voiceNotes, ...mediciones } =
    parsed.data

  // Las rutas las generó el servidor al firmar, pero vuelven desde el
  // navegador: se revalida que TODAS apunten a ESTA finca antes de guardarlas.
  for (const nota of voiceNotes) {
    const partes = interpretarRuta(nota.ruta)
    if (!partes || partes.farmId !== farmId) {
      return { error: 'Alguna de las notas de voz no es válida' }
    }
  }

  // El pozo se verifica dentro de la finca ya autorizada: aunque llegue el id
  // de un pozo ajeno, acá no aparece.
  const pozo = await prisma.well.findFirst({
    where: { id: wellId, farmId, deletedAt: null },
    select: { id: true },
  })
  if (!pozo) return { error: 'No se encontró el pozo' }

  const hayMediciones = Object.values(mediciones).some((v) => v !== undefined) || !!pumpId

  await prisma.$transaction(async (tx) => {
    const intervencion = await tx.intervention.create({
      data: {
        wellId,
        performedAt,
        createdById: actor.id,
        services: { create: serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })) },
      },
      select: { id: true },
    })

    // Solo se crea la fila de mediciones si hay algo que guardar: si no,
    // el historial se llena de lecturas vacías que ensucian el gráfico.
    if (hayMediciones) {
      await tx.wellStatusReading.create({
        data: {
          wellId,
          interventionId: intervencion.id,
          measuredAt: performedAt,
          createdById: actor.id,
          pumpId,
          ...mediciones,
        },
      })
    }

    // Una observación existe si hay texto, audios, o ambos. Nunca vacía.
    if (observations || voiceNotes.length > 0) {
      await tx.observation.create({
        data: {
          wellId,
          interventionId: intervencion.id,
          body: observations ?? null,
          createdById: actor.id,
          voiceNotes: {
            create: voiceNotes.map((nota) => ({
              storagePath: nota.ruta,
              mimeType: nota.mime,
              durationSec: nota.duracion,
            })),
          },
        },
      })
    }
  })

  revalidatePath(`/fincas/${farmId}/pozos/${wellId}`)
  redirect(`/fincas/${farmId}/pozos/${wellId}`)
}

export async function archivarIntervencionAction(
  farmId: string,
  wellId: string,
  interventionId: string,
) {
  await requireAccess('write', 'intervention', farmId)

  // El where incluye el pozo: no se puede archivar la intervención de otro.
  await prisma.intervention.updateMany({
    where: { id: interventionId, wellId, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  revalidatePath(`/fincas/${farmId}/pozos/${wellId}`)
}
