'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { crearUsuarioSchema, editarUsuarioSchema } from '@/lib/validation/schemas'
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

/** Lee farmIds de un FormData con checkboxes repetidos. */
function fincasSeleccionadas(formData: FormData): string[] {
  return formData.getAll('farmIds').filter((v): v is string => typeof v === 'string' && v !== '')
}

export async function crearUsuarioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAccess('write', 'user')

  const parsed = crearUsuarioSchema.safeParse({
    ...Object.fromEntries(formData),
    farmIds: fincasSeleccionadas(formData),
  })

  if (!parsed.success) {
    return { error: 'Revisá los datos', fieldErrors: erroresDeCampo(parsed.error.issues) }
  }

  const { farmIds, password, ...datos } = parsed.data

  const yaExiste = await prisma.user.findUnique({
    where: { email: datos.email },
    select: { id: true },
  })
  if (yaExiste) {
    return { error: 'Ese email ya tiene cuenta', fieldErrors: { email: 'Ya está registrado' } }
  }

  await prisma.user.create({
    data: {
      ...datos,
      passwordHash: await bcrypt.hash(password, 12),
      // El admin crea la cuenta: no hay verificación por mail que esperar.
      emailVerified: new Date(),
      memberships: { create: farmIds.map((farmId) => ({ farmId })) },
    },
  })

  revalidatePath('/admin/usuarios')
  redirect('/admin/usuarios')
}

export async function editarUsuarioAction(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAccess('write', 'user')

  const parsed = editarUsuarioSchema.safeParse({
    ...Object.fromEntries(formData),
    farmIds: fincasSeleccionadas(formData),
  })

  if (!parsed.success) {
    return { error: 'Revisá los datos', fieldErrors: erroresDeCampo(parsed.error.issues) }
  }

  const { farmIds, password, ...datos } = parsed.data

  // Un admin no puede quitarse a sí mismo el rol de admin: dejaría el sistema
  // sin nadie que pueda administrarlo.
  if (userId === actor.id && datos.role !== 'ADMIN') {
    return { error: 'No podés quitarte a vos mismo el rol de administrador' }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        ...datos,
        // Contraseña vacía = no se cambia.
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      },
    }),
    // Se reemplaza el set completo de membresías: es más simple y más seguro
    // que calcular altas y bajas por separado.
    prisma.farmMember.deleteMany({ where: { userId } }),
    prisma.farmMember.createMany({
      data: farmIds.map((farmId) => ({ farmId, userId })),
      skipDuplicates: true,
    }),
  ])

  revalidatePath('/admin/usuarios')
  redirect('/admin/usuarios')
}

/**
 * Baja lógica del usuario: se desactiva, no se borra. Sus cargas históricas
 * (remitos, intervenciones) referencian su id y deben seguir siendo trazables.
 */
export async function desactivarUsuarioAction(userId: string) {
  const actor = await requireAccess('write', 'user')

  if (userId === actor.id) {
    // Sin este corte, un admin se deja afuera del sistema de un click.
    return
  }

  await prisma.user.update({ where: { id: userId }, data: { isActive: false } })
  revalidatePath('/admin/usuarios')
}

export async function reactivarUsuarioAction(userId: string) {
  await requireAccess('write', 'user')

  await prisma.user.update({ where: { id: userId }, data: { isActive: true } })
  revalidatePath('/admin/usuarios')
}
