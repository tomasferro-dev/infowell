import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'

import { auth } from '@/server/auth'
import { authorize, type Action, type Actor, type Resource } from '@/server/authz'
import { prisma } from '@/server/db'

/**
 * Envoltorio con sesión y DB alrededor de la lógica pura de authz.ts.
 *
 * TODA Server Action y toda query de negocio arranca por acá. Si una consulta
 * no pasó por un guard, es un bug de seguridad, no un descuido de estilo.
 */

/**
 * Arma el Actor del request. Las fincas se leen de la base en cada request
 * (no del JWT) para que quitarle una finca a un cliente tenga efecto YA, sin
 * esperar a que le venza la sesión.
 *
 * `cache()` lo memoiza por request: si veinte componentes lo piden, la query
 * sale una sola vez.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth()
  if (!session?.user?.id) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      isActive: true,
      memberships: { select: { farmId: true } },
    },
  })

  // El usuario pudo ser borrado o dado de baja con la sesión todavía viva.
  if (!user || !user.isActive) return null

  return {
    id: user.id,
    role: user.role,
    isActive: user.isActive,
    farmIds: user.memberships.map((m) => m.farmId),
  }
})

/** Exige sesión válida. Redirige al login si no hay. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

/**
 * Exige permiso concreto sobre un recurso.
 *
 * Falla con 404, NO con 403: un 403 sobre /fincas/{id} le confirma a un
 * curioso que esa finca existe. Para quien no tiene acceso, no existe.
 */
export async function requireAccess(
  action: Action,
  resource: Resource,
  farmId?: string,
): Promise<Actor> {
  const actor = await requireActor()
  if (!authorize(actor, action, resource, farmId)) notFound()
  return actor
}

/** Variante booleana, para decidir si se renderiza un botón. */
export async function can(action: Action, resource: Resource, farmId?: string): Promise<boolean> {
  const actor = await getActor()
  if (!actor) return false
  return authorize(actor, action, resource, farmId)
}

/**
 * IDs de las fincas visibles para el actor, ya listo para meter en un
 * `where: { farmId: { in: ... } }`. `null` = sin restricción (ADMIN).
 */
export async function visibleFarmIds(): Promise<string[] | null> {
  const actor = await requireActor()
  return actor.role === 'ADMIN' ? null : actor.farmIds
}
