import type { UserRole } from '@/generated/prisma/enums'

/**
 * Núcleo de autorización. Deliberadamente PURO: sin sesión, sin Prisma, sin
 * imports de Next. Así se puede probar de forma exhaustiva y barata, que es lo
 * que corresponde para la regla de la que depende el aislamiento entre fincas.
 *
 * El envoltorio con sesión y DB vive en guards.ts.
 */

/** Datos mínimos del usuario para decidir. Salen del JWT, no de la DB. */
export type Actor = {
  id: string
  role: UserRole
  /** Fincas asignadas vía FarmMember. Irrelevante para ADMIN. */
  farmIds: string[]
  isActive: boolean
}

export type Action = 'read' | 'write'

export type Resource =
  | 'farm'
  | 'well'
  | 'intervention'
  | 'reading'
  | 'observation'
  | 'receipt'
  | 'catalog' // ServiceType y Pump: globales, no pertenecen a una finca
  | 'setting' // ajustes de la app: globales, los cambia solo el admin
  | 'annotation' // dibujo suelto del mapa: no cuelga de ninguna finca
  | 'overlay' // imagen que el usuario calza sobre el mapa de una finca
  | 'user' // gestión de usuarios y membresías

/** Recursos que SIEMPRE pertenecen a una finca y exigen scope. */
const FARM_SCOPED: ReadonlySet<Resource> = new Set<Resource>([
  'farm',
  'well',
  'intervention',
  'reading',
  'observation',
  'receipt',
  // La imagen del mapa muestra el terreno de una finca: si se escapara del
  // scope, un cliente vería el campo de otro. Va acá desde el primer día,
  // no como agregado después.
  'overlay',
])

/**
 * Qué puede escribir cada rol, sin considerar la finca todavía.
 * ADMIN se resuelve antes y no figura acá.
 */
const WRITABLE_BY_ROLE: Record<Exclude<UserRole, 'ADMIN'>, ReadonlySet<Resource>> = {
  // El operario de campo carga remitos y marca referencias sueltas en el
  // mapa: es el que anda por la ruta y sabe por dónde se entra.
  CARGADOR: new Set<Resource>(['receipt', 'annotation']),
  // El cliente es estrictamente de solo lectura.
  CLIENTE: new Set<Resource>(),
}

/** ¿El actor tiene la finca asignada? ADMIN no necesita membresía. */
export function hasFarmAccess(actor: Actor, farmId: string): boolean {
  if (actor.role === 'ADMIN') return true
  return actor.farmIds.includes(farmId)
}

/**
 * Decide si `actor` puede hacer `action` sobre `resource`.
 *
 * `farmId` es obligatorio para los recursos de finca: si falta, se NIEGA. Una
 * query que se olvidó de pasar el scope no debe colarse por omisión — ese
 * olvido es la forma más común de filtrar datos entre clientes.
 */
export function authorize(
  actor: Actor,
  action: Action,
  resource: Resource,
  farmId?: string,
): boolean {
  // Un usuario dado de baja no hace nada, sin importar el rol.
  if (!actor.isActive) return false

  if (FARM_SCOPED.has(resource)) {
    if (!farmId) return false
    if (!hasFarmAccess(actor, farmId)) return false
  }

  if (actor.role === 'ADMIN') return true

  // 'user' es exclusivo del admin; ya quedó descartado arriba.
  if (resource === 'user') return false

  // Un dibujo suelto no cuelga de ninguna finca, así que queda fuera de la
  // cadena que garantiza el aislamiento: es interno, y el cliente no lo ve ni
  // para leer. Sus nombres podrían delatarle dónde están las fincas de otros.
  if (resource === 'annotation') return WRITABLE_BY_ROLE[actor.role].has(resource)

  // Cualquier autenticado lee el catálogo (son nombres de servicios, no datos
  // de cliente); escribirlo es solo del admin.
  if (action === 'read') return true

  return WRITABLE_BY_ROLE[actor.role].has(resource)
}
