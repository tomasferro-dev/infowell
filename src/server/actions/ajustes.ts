'use server'

import { revalidatePath } from 'next/cache'

import {
  CLAVE_NUMERACION,
  esCriterio,
  type CriterioNumeracion,
} from '@/server/queries/ajustes'
import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'

/**
 * Cambia el criterio con el que se numeran los pozos.
 *
 * Solo el administrador: el número es cómo se nombra un pozo en voz alta, y
 * cambiarlo se lo cambia a TODOS los usuarios a la vez.
 */
export async function guardarNumeracionAction(criterio: string) {
  await requireAccess('write', 'setting')

  // El valor viene del cliente: si no es uno de los dos conocidos, no se
  // guarda. Un valor raro en la base dejaría el mapa mostrando el criterio
  // por defecto sin que nadie entienda por qué.
  if (!esCriterio(criterio)) {
    return { ok: false as const, error: 'Ese criterio de numeración no existe' }
  }

  const actor = await requireActor()

  await prisma.appSetting.upsert({
    where: { key: CLAVE_NUMERACION },
    create: { key: CLAVE_NUMERACION, value: criterio, updatedById: actor.id },
    update: { value: criterio, updatedById: actor.id },
  })

  // El número aparece en el mapa; sin esto seguiría mostrando el anterior.
  revalidatePath('/mapa')
  revalidatePath('/admin/configuracion')

  return { ok: true as const, criterio: criterio satisfies CriterioNumeracion }
}
