'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { BUCKET_NOTAS_VOZ, interpretarRuta } from '@/lib/storage-paths'
import { crearIntervencionSchema } from '@/lib/validation/intervencion'
import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'
import { borrarArchivo } from '@/server/storage'

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

/**
 * Edita una intervención ya cargada.
 *
 * Sirve para lo que pasa siempre en el campo: cargar 12 donde iban 120, o
 * acordarse de una observación al día siguiente. Reemplaza el conjunto
 * completo —servicios, mediciones, observación y notas de voz— en una sola
 * transacción, para que nunca quede a medias.
 */
export async function editarIntervencionAction(
  farmId: string,
  wellId: string,
  interventionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAccess('write', 'intervention', farmId)

  const parsed = crearIntervencionSchema.safeParse({
    ...Object.fromEntries(formData),
    serviceTypeIds: formData
      .getAll('serviceTypeIds')
      .filter((v): v is string => typeof v === 'string'),
    voiceNotes: formData.getAll('voiceNotes').filter((v): v is string => typeof v === 'string'),
  })

  if (!parsed.success) {
    return {
      error: parsed.error.issues.find((i) => i.path.length === 0)?.message ?? 'Revisá los datos',
      fieldErrors: erroresDeCampo(parsed.error.issues),
    }
  }

  const { serviceTypeIds, observations, performedAt, pumpId, voiceNotes, ...mediciones } =
    parsed.data

  for (const nota of voiceNotes) {
    const partes = interpretarRuta(nota.ruta)
    if (!partes || partes.farmId !== farmId) {
      return { error: 'Alguna de las notas de voz no es válida' }
    }
  }

  // El pozo y la finca van en el where: no se puede editar la intervención de
  // otra finca aunque se conozca su id.
  const existente = await prisma.intervention.findFirst({
    where: { id: interventionId, wellId, deletedAt: null, well: { farmId } },
    select: { id: true, observations: { where: { deletedAt: null }, select: { id: true } } },
  })

  if (!existente) return { error: 'No se encontró la intervención' }

  const hayMediciones = Object.values(mediciones).some((v) => v !== undefined) || !!pumpId
  const rutasQueQuedan = new Set(voiceNotes.map((n) => n.ruta))

  /** Audios que el usuario quitó: se borran del disco DESPUÉS de confirmar. */
  const aBorrarDeStorage: string[] = []

  await prisma.$transaction(async (tx) => {
    await tx.intervention.update({
      where: { id: interventionId },
      data: { performedAt },
    })

    // Se reemplaza el set completo de servicios: más simple y más seguro que
    // calcular altas y bajas por separado.
    await tx.interventionService.deleteMany({ where: { interventionId } })
    if (serviceTypeIds.length > 0) {
      await tx.interventionService.createMany({
        data: serviceTypeIds.map((serviceTypeId) => ({ interventionId, serviceTypeId })),
      })
    }

    // Mediciones: se crean, actualizan o borran según lo que quedó cargado.
    if (hayMediciones) {
      await tx.wellStatusReading.upsert({
        where: { interventionId },
        create: {
          wellId,
          interventionId,
          measuredAt: performedAt,
          createdById: actor.id,
          pumpId,
          ...mediciones,
        },
        update: { measuredAt: performedAt, pumpId, ...mediciones },
      })
    } else {
      // Si se vaciaron todas, la fila deja de tener sentido y ensuciaría el
      // gráfico de evolución con un punto sin valores.
      await tx.wellStatusReading.deleteMany({ where: { interventionId } })
    }

    // Notas de voz que el usuario sacó del formulario.
    const notasActuales = await tx.voiceNote.findMany({
      where: { observation: { interventionId } },
      select: { id: true, storagePath: true },
    })

    const quitadas = notasActuales.filter((n) => !rutasQueQuedan.has(n.storagePath))
    if (quitadas.length > 0) {
      await tx.voiceNote.deleteMany({ where: { id: { in: quitadas.map((n) => n.id) } } })
      aBorrarDeStorage.push(...quitadas.map((n) => n.storagePath))
    }

    const yaGuardadas = new Set(notasActuales.map((n) => n.storagePath))
    const nuevas = voiceNotes.filter((n) => !yaGuardadas.has(n.ruta))

    const observacionExistente = existente.observations[0]

    if (observations || voiceNotes.length > 0) {
      if (observacionExistente) {
        await tx.observation.update({
          where: { id: observacionExistente.id },
          data: {
            body: observations ?? null,
            voiceNotes: {
              create: nuevas.map((nota) => ({
                storagePath: nota.ruta,
                mimeType: nota.mime,
                durationSec: nota.duracion,
              })),
            },
          },
        })
      } else {
        await tx.observation.create({
          data: {
            wellId,
            interventionId,
            body: observations ?? null,
            createdById: actor.id,
            voiceNotes: {
              create: nuevas.map((nota) => ({
                storagePath: nota.ruta,
                mimeType: nota.mime,
                durationSec: nota.duracion,
              })),
            },
          },
        })
      }
    } else if (observacionExistente) {
      // Sin texto ni audios, la observación queda vacía: se archiva.
      await tx.observation.update({
        where: { id: observacionExistente.id },
        data: { deletedAt: new Date() },
      })
    }
  })

  // Recién con la transacción confirmada se tocan los archivos: si se
  // borraran antes y algo fallara, el audio se perdería sin haber cambiado
  // nada en la base.
  for (const ruta of aBorrarDeStorage) {
    await borrarArchivo(BUCKET_NOTAS_VOZ, ruta).catch(() => {
      // Un archivo huérfano es molesto, pero no puede tumbar la edición.
    })
  }

  revalidatePath(`/fincas/${farmId}/pozos/${wellId}`)
  redirect(`/fincas/${farmId}/pozos/${wellId}`)
}

/**
 * Elimina una intervención cargada por error.
 *
 * Es baja lógica: la fila queda en la base con `deletedAt`. Los datos técnicos
 * de un pozo son historial, y un borrado real no se puede deshacer si mañana
 * resulta que la intervención sí existía. Los audios tampoco se tocan.
 */
export async function archivarIntervencionAction(
  farmId: string,
  wellId: string,
  interventionId: string,
) {
  await requireAccess('write', 'intervention', farmId)

  // El where incluye el pozo y la finca: no se puede archivar la de otro.
  const { count } = await prisma.intervention.updateMany({
    where: { id: interventionId, wellId, deletedAt: null, well: { farmId } },
    data: { deletedAt: new Date() },
  })

  if (count === 0) return

  revalidatePath(`/fincas/${farmId}/pozos/${wellId}`)
  redirect(`/fincas/${farmId}/pozos/${wellId}`)
}
