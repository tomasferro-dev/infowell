import 'server-only'

import { prisma } from '@/server/db'
import { requireActor } from '@/server/guards'

/**
 * Ajustes de la aplicación.
 *
 * Son globales y los lee cualquier usuario que vea el mapa —el número de un
 * pozo tiene que ser el mismo para todos, o dejaría de servir para nombrarlo
 * en voz alta—. Escribirlos, en cambio, es solo del administrador: eso vive en
 * las server actions, no acá.
 */

/** Con qué criterio se numeran los pozos de una finca. */
export const CRITERIOS_NUMERACION = ['carga', 'perforacion'] as const
export type CriterioNumeracion = (typeof CRITERIOS_NUMERACION)[number]

export const CLAVE_NUMERACION = 'numeracion_pozos'

/** Por orden de carga: es el único criterio que siempre tiene dato. */
const POR_DEFECTO: CriterioNumeracion = 'carga'

export function esCriterio(valor: unknown): valor is CriterioNumeracion {
  return CRITERIOS_NUMERACION.includes(valor as CriterioNumeracion)
}

export async function criterioDeNumeracion(): Promise<CriterioNumeracion> {
  // No hay nada sensible en un ajuste de numeración, pero ninguna consulta de
  // este proyecto sale sin sesión: la excepción de hoy es el agujero de mañana.
  await requireActor()

  const fila = await prisma.appSetting.findUnique({
    where: { key: CLAVE_NUMERACION },
    select: { value: true },
  })

  // Un valor desconocido en la base no debería tumbar el mapa: se cae al
  // criterio por defecto, que es el que nunca deja pozos sin número.
  return esCriterio(fila?.value) ? fila.value : POR_DEFECTO
}
