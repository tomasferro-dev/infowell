'use server'

import { revalidatePath } from 'next/cache'

import { validarGeometria } from '@/lib/anotaciones'
import { respaldoSchema, VERSION_RESPALDO } from '@/lib/respaldo'
import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'
import { armarRespaldo } from '@/server/queries/respaldo'

export type ResultadoRespaldo =
  | { ok: true; fincas: number; pozos: number; dibujos: number; omitidos: number }
  | { ok: false; error: string }

/** Devuelve el respaldo listo para bajar. La descarga la hace el navegador. */
export async function exportarAction() {
  const { datos, archivo } = await armarRespaldo()

  return { archivo, contenido: JSON.stringify(datos, null, 2) }
}

/**
 * Vuelve a cargar un respaldo.
 *
 * Es un *upsert* por id, no un borrado y alta: importar dos veces el mismo
 * archivo deja lo mismo que importarlo una, y volver a importar una copia
 * vieja sobre datos nuevos corrige lo que estaba en la copia sin borrar lo que
 * se agregó después. Un import que borrara primero convertiría cada
 * equivocación en pérdida de datos.
 */
export async function importarAction(contenido: string): Promise<ResultadoRespaldo> {
  await requireAccess('write', 'setting')

  let crudo: unknown
  try {
    crudo = JSON.parse(contenido)
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido' }
  }

  const parsed = respaldoSchema.safeParse(crudo)
  if (!parsed.success) {
    const primero = parsed.error.issues[0]
    return {
      ok: false,
      error: primero ? `${primero.path.join('.')}: ${primero.message}` : 'El archivo no tiene el formato esperado',
    }
  }

  const datos = parsed.data

  if (datos.version > VERSION_RESPALDO) {
    return {
      ok: false,
      error: `El archivo es de una versión más nueva (${datos.version}). Actualizá la app antes de importarlo.`,
    }
  }

  const actor = await requireActor()

  let pozos = 0
  let dibujos = 0
  let omitidos = 0

  // Las fincas y sus pozos primero: los dibujos los referencian, y un dibujo
  // cuya finca todavía no existe no se puede guardar.
  for (const finca of datos.fincas) {
    const campos = {
      name: finca.name,
      taxId: finca.taxId ?? null,
      address: finca.address ?? null,
      city: finca.city ?? null,
      province: finca.province ?? null,
      contactName: finca.contactName ?? null,
      contactPhone: finca.contactPhone ?? null,
      contactEmail: finca.contactEmail ?? null,
      notes: finca.notes ?? null,
      latitude: finca.latitude ?? null,
      longitude: finca.longitude ?? null,
      isActive: finca.isActive ?? true,
    }

    await prisma.farm.upsert({
      where: { id: finca.id },
      update: campos,
      create: { id: finca.id, ...campos },
    })

    for (const pozo of finca.pozos) {
      const suyos = {
        name: pozo.name,
        code: pozo.code ?? null,
        latitude: pozo.latitude ?? null,
        longitude: pozo.longitude ?? null,
        drilledAt: pozo.drilledAt ? new Date(`${pozo.drilledAt}T00:00:00Z`) : null,
        notes: pozo.notes ?? null,
        isActive: pozo.isActive ?? true,
      }

      await prisma.well.upsert({
        where: { id: pozo.id },
        update: suyos,
        create: { id: pozo.id, farmId: finca.id, ...suyos },
      })
      pozos += 1
    }
  }

  const fincasDelArchivo = new Set(datos.fincas.map((f) => f.id))
  const pozosDelArchivo = new Set(datos.fincas.flatMap((f) => f.pozos.map((p) => p.id)))

  for (const dibujo of datos.dibujos) {
    // La geometría se valida con las mismas reglas que al dibujarlo: el
    // archivo lo pudo tocar cualquiera, y una figura rota tumbaría el mapa.
    const geo = validarGeometria(dibujo.kind, dibujo.geometry)
    if (!geo.ok) {
      omitidos += 1
      continue
    }

    // Un dibujo que cuelga de una finca o un pozo que no vino en el archivo
    // quedaría huérfano: se omite y se cuenta, en vez de fallar entero.
    if (dibujo.farmId && !fincasDelArchivo.has(dibujo.farmId)) {
      omitidos += 1
      continue
    }
    if (dibujo.wellId && !pozosDelArchivo.has(dibujo.wellId)) {
      omitidos += 1
      continue
    }

    const campos = {
      farmId: dibujo.farmId ?? null,
      wellId: dibujo.wellId ?? null,
      kind: geo.forma,
      label: dibujo.label ?? null,
      notes: dibujo.notes ?? null,
      color: dibujo.color,
      filled: dibujo.filled,
      geometry: geo.puntos,
    }

    await prisma.mapAnnotation.upsert({
      where: { id: dibujo.id },
      update: campos,
      create: { id: dibujo.id, ...campos, createdById: actor.id },
    })
    dibujos += 1
  }

  revalidatePath('/mapa')
  revalidatePath('/fincas')
  revalidatePath('/')

  return { ok: true, fincas: datos.fincas.length, pozos, dibujos, omitidos }
}
