'use server'

import { revalidatePath } from 'next/cache'

import {
  OPACIDAD_POR_DEFECTO,
  esEsquinas,
  esOpacidad,
  rutaEsDeLaFinca,
} from '@/lib/imagen-mapa'
import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'

/**
 * Alta y baja de las imágenes que se calzan sobre el mapa.
 *
 * Todo entra por `requireAccess('write', 'overlay', farmId)`: la imagen
 * muestra el terreno de una finca, así que quien no puede escribir esa finca
 * tampoco le pone imágenes. Hoy solo el ADMIN, ver `authz.ts`.
 */

export type ResultadoImagen = { ok: true; id: string } | { ok: false; error: string }

/** Recorta y limpia lo que escribe el usuario. Vacío se guarda como null. */
function texto(valor: unknown, tope: number): string | null {
  if (typeof valor !== 'string') return null

  const limpio = valor.trim().slice(0, tope)
  return limpio === '' ? null : limpio
}

export async function guardarImagenMapaAction(datos: {
  farmId: string
  rutaArchivo: string
  esquinas: unknown
  opacidad?: unknown
  etiqueta?: string
}): Promise<ResultadoImagen> {
  await requireAccess('write', 'overlay', datos.farmId)

  /*
   * La ruta la manda el navegador, así que se comprueba que sea de ESTA finca.
   * Sin esto, alguien podría grabar una fila propia apuntando a la carpeta de
   * otra finca — y la ruta de lectura firma contra el farmId de la ruta, no el
   * de la fila.
   */
  if (!rutaEsDeLaFinca(datos.rutaArchivo, datos.farmId)) {
    return { ok: false, error: 'Ese archivo no es de esta finca' }
  }

  // Las esquinas vienen del navegador y se guardan como Json: Prisma no mira
  // adentro, así que si no se validan acá no se validan en ningún lado.
  if (!esEsquinas(datos.esquinas)) {
    return { ok: false, error: 'No se pudo leer dónde quedó la imagen' }
  }

  const actor = await requireActor()

  const creada = await prisma.mapOverlay.create({
    data: {
      farmId: datos.farmId,
      rutaArchivo: datos.rutaArchivo,
      esquinas: datos.esquinas,
      opacidad: esOpacidad(datos.opacidad) ? datos.opacidad : OPACIDAD_POR_DEFECTO,
      etiqueta: texto(datos.etiqueta, 120),
      createdById: actor.id,
    },
    select: { id: true },
  })

  revalidatePath('/mapa')

  return { ok: true, id: creada.id }
}

export async function borrarImagenMapaAction(
  farmId: string,
  id: string,
): Promise<ResultadoImagen> {
  await requireAccess('write', 'overlay', farmId)

  /*
   * Borrado suave, como el resto de la app. El archivo queda en el bucket: es
   * el mismo caso que los audios abandonados, y limpiar huérfanos es una tarea
   * aparte (§10 de la bitácora). Borrarlo acá sería irreversible aunque la
   * fila no lo sea.
   *
   * El farmId va en el where junto al id: sin eso, alguien podría borrar la
   * imagen de otra finca pasando el farmId de la suya.
   */
  const borrada = await prisma.mapOverlay.updateMany({
    where: { id, farmId, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  if (borrada.count === 0) return { ok: false, error: 'Esa imagen ya no está' }

  revalidatePath('/mapa')

  return { ok: true, id }
}
