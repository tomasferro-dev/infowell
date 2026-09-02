'use server'

import { revalidatePath } from 'next/cache'

import { esClaveColor, FORMAS, validarGeometria, type Forma } from '@/lib/anotaciones'
import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'

/**
 * Alta, edición y borrado de los dibujos del mapa.
 *
 * Todo entra por `requireAccess('write', 'farm', farmId)`: un dibujo pertenece
 * a una finca, así que quien no puede escribir esa finca tampoco puede rayarle
 * el mapa. El CLIENTE, que es de solo lectura, no puede ninguno.
 */

export type ResultadoAnotacion = { ok: true; id: string } | { ok: false; error: string }

/** Recorta y limpia lo que escribe el usuario. Vacío se guarda como null. */
function texto(valor: unknown, tope: number): string | null {
  if (typeof valor !== 'string') return null

  const limpio = valor.trim().slice(0, tope)
  return limpio === '' ? null : limpio
}

function esForma(valor: unknown): valor is Forma {
  return FORMAS.includes(valor as Forma)
}

/**
 * Quién puede tocar un dibujo, según de qué cuelgue.
 *
 * Con finca, el permiso sale de ella. Sin finca —un punto de referencia en la
 * ruta— no hay de dónde sacarlo: es un recurso propio, interno, que el cliente
 * no ve ni toca. Ver `authz.ts`.
 */
async function exigirPermiso(farmId: string | null | undefined) {
  if (farmId) return requireAccess('write', 'farm', farmId)
  return requireAccess('write', 'annotation')
}

export async function guardarAnotacionAction(datos: {
  id?: string
  farmId: string | null
  wellId?: string | null
  forma: string
  puntos: unknown
  etiqueta?: string
  notas?: string
  color?: string
  pintado?: boolean
}): Promise<ResultadoAnotacion> {
  await exigirPermiso(datos.farmId)

  if (!esForma(datos.forma)) return { ok: false, error: 'Esa forma no existe' }

  // La geometría llega del navegador: se valida acá, no solo al dibujar.
  const geo = validarGeometria(datos.forma, datos.puntos)
  if (!geo.ok) return { ok: false, error: geo.error }

  const actor = await requireActor()

  const comun = {
    kind: geo.forma,
    label: texto(datos.etiqueta, 120),
    notes: texto(datos.notas, 1000),
    color: esClaveColor(datos.color) ? datos.color : 'rojo',
    filled: datos.pintado === true,
    geometry: geo.puntos,
  }

  // El pozo tiene que ser de la finca del dibujo: si no, alguien podría
  // colgarle un dibujo al pozo de otra finca pasando el farmId de la suya.
  if (datos.wellId) {
    const pozo = await prisma.well.findFirst({
      where: { id: datos.wellId, farmId: datos.farmId ?? undefined, deletedAt: null },
      select: { id: true },
    })
    if (!pozo) return { ok: false, error: 'Ese pozo no es de esta finca' }
  }

  if (datos.id) {
    // El farmId va en el where junto al id: sin eso, alguien podría editar el
    // dibujo de otra finca pasando el farmId de la suya.
    const existente = await prisma.mapAnnotation.findFirst({
      where: { id: datos.id, farmId: datos.farmId, deletedAt: null },
      select: { id: true },
    })
    if (!existente) return { ok: false, error: 'Ese dibujo ya no está' }

    await prisma.mapAnnotation.update({
      where: { id: datos.id },
      data: { ...comun, wellId: datos.wellId ?? null },
    })
    revalidatePath('/mapa')

    return { ok: true, id: datos.id }
  }

  const creada = await prisma.mapAnnotation.create({
    data: {
      ...comun,
      farmId: datos.farmId,
      wellId: datos.wellId ?? null,
      createdById: actor.id,
    },
    select: { id: true },
  })

  revalidatePath('/mapa')

  return { ok: true, id: creada.id }
}

export async function borrarAnotacionAction(
  farmId: string | null,
  id: string,
): Promise<ResultadoAnotacion> {
  await exigirPermiso(farmId)

  // Borrado suave, como todo lo demás: un dibujo puede ser la única anotación
  // de cómo se entra a una finca, y eso no se pierde por un toque de más.
  const borrada = await prisma.mapAnnotation.updateMany({
    where: { id, farmId, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  if (borrada.count === 0) return { ok: false, error: 'Ese dibujo ya no está' }

  revalidatePath('/mapa')

  return { ok: true, id }
}
