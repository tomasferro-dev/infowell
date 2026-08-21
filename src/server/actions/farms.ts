'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { crearFincaSchema, crearPozoSchema } from '@/lib/validation/schemas'
import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

export type FormState = {
  error?: string
  fieldErrors?: Record<string, string>
}

/** Aplana los errores de Zod a { campo: mensaje } para pintarlos en el form. */
function erroresDeCampo(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const campo = String(issue.path[0] ?? '')
    if (campo && !out[campo]) out[campo] = issue.message
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// FINCAS
// ─────────────────────────────────────────────────────────────

export async function crearFincaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Crear una finca no cuelga de una finca existente: lo puede hacer solo el
  // admin, y eso se valida con el recurso 'user' (gestión global).
  await requireAccess('write', 'user')

  const parsed = crearFincaSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Revisá los datos', fieldErrors: erroresDeCampo(parsed.error.issues) }
  }

  const finca = await prisma.farm.create({ data: parsed.data, select: { id: true } })

  revalidatePath('/fincas')
  revalidatePath('/mapa')
  redirect(`/fincas/${finca.id}`)
}

export async function editarFincaAction(
  farmId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAccess('write', 'farm', farmId)

  const parsed = crearFincaSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Revisá los datos', fieldErrors: erroresDeCampo(parsed.error.issues) }
  }

  await prisma.farm.update({ where: { id: farmId }, data: parsed.data })

  revalidatePath('/fincas')
  revalidatePath(`/fincas/${farmId}`)
  revalidatePath('/mapa')
  redirect(`/fincas/${farmId}`)
}

/**
 * Baja lógica. Nunca se borra de verdad: una finca arrastra pozos, historial
 * técnico y remitos, que son información contable y técnica.
 */
export async function archivarFincaAction(farmId: string) {
  await requireAccess('write', 'farm', farmId)

  await prisma.farm.update({
    where: { id: farmId },
    data: { deletedAt: new Date(), isActive: false },
  })

  revalidatePath('/fincas')
  revalidatePath('/mapa')
  redirect('/fincas')
}

// ─────────────────────────────────────────────────────────────
// POZOS
// ─────────────────────────────────────────────────────────────

export async function crearPozoAction(
  farmId: string,
  /**
   * Si el alta arrancó marcando el punto en el mapa, se vuelve al mapa.
   *
   * Es un booleano y no una ruta a propósito: el valor va y vuelve por el
   * cliente, y aceptar una URL de ahí sería un redirect abierto. Acá el
   * cliente solo elige entre dos destinos que están escritos en el servidor.
   */
  volverAlMapa: boolean,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAccess('write', 'well', farmId)

  const parsed = crearPozoSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Revisá los datos', fieldErrors: erroresDeCampo(parsed.error.issues) }
  }

  try {
    await prisma.well.create({ data: { ...parsed.data, farmId } })
  } catch {
    // Choca con @@unique([farmId, name]): dos "Pozo N° 1" en la misma finca.
    return {
      error: 'Ya existe un pozo con ese nombre en esta finca',
      fieldErrors: { name: 'Elegí otro nombre' },
    }
  }

  revalidatePath(`/fincas/${farmId}`)
  revalidatePath('/mapa')
  redirect(volverAlMapa ? '/mapa' : `/fincas/${farmId}`)
}

export async function editarPozoAction(
  farmId: string,
  wellId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAccess('write', 'well', farmId)

  const parsed = crearPozoSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Revisá los datos', fieldErrors: erroresDeCampo(parsed.error.issues) }
  }

  // El farmId en el where impide editar un pozo de otra finca aun conociendo
  // su id: updateMany no encuentra nada y no afecta filas.
  const { count } = await prisma.well.updateMany({
    where: { id: wellId, farmId, deletedAt: null },
    data: parsed.data,
  })

  if (count === 0) return { error: 'No se encontró el pozo' }

  revalidatePath(`/fincas/${farmId}`)
  revalidatePath('/mapa')
  redirect(`/fincas/${farmId}/pozos/${wellId}`)
}

export async function archivarPozoAction(farmId: string, wellId: string) {
  await requireAccess('write', 'well', farmId)

  await prisma.well.updateMany({
    where: { id: wellId, farmId, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })

  revalidatePath(`/fincas/${farmId}`)
  revalidatePath('/mapa')
  redirect(`/fincas/${farmId}`)
}
