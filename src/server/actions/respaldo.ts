'use server'

import { revalidatePath } from 'next/cache'

import { validarGeometria } from '@/lib/anotaciones'
import { respaldoSchema, VERSION_RESPALDO } from '@/lib/respaldo'
import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'
import { armarRespaldo } from '@/server/queries/respaldo'

export type ResultadoRespaldo =
  | {
      ok: true
      fincas: number
      pozos: number
      dibujos: number
      intervenciones: number
      omitidos: number
    }
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

  /*
   * El historial.
   *
   * Los servicios y las bombas se buscan por su llave natural —slug y etiqueta
   * normalizada— porque los cuid son distintos en cada base. Lo que no esté en
   * el catálogo de ESTA base se omite y se cuenta: es preferible una
   * intervención con un servicio de menos que ninguna intervención.
   *
   * `createdById` es quien importa. No hay a quién más atribuirlo: el respaldo
   * no lleva usuarios, a propósito.
   */
  let intervenciones = 0

  if (datos.intervenciones.length > 0) {
    const [servicios, bombas] = await Promise.all([
      prisma.serviceType.findMany({ select: { id: true, slug: true } }),
      prisma.pump.findMany({ select: { id: true, normalizedLabel: true } }),
    ])

    const idPorSlug = new Map(servicios.map((s) => [s.slug, s.id]))
    const idPorBomba = new Map(bombas.map((b) => [b.normalizedLabel, b.id]))

    for (const inter of datos.intervenciones) {
      // Sin el pozo en el archivo, la intervención no tiene dónde colgar.
      if (!pozosDelArchivo.has(inter.wellId)) {
        omitidos += 1
        continue
      }

      const performedAt = new Date(`${inter.performedAt}T00:00:00Z`)

      await prisma.intervention.upsert({
        where: { id: inter.id },
        update: { wellId: inter.wellId, performedAt },
        create: { id: inter.id, wellId: inter.wellId, performedAt, createdById: actor.id },
      })

      /*
       * Servicios y observaciones van por UPSERT, no por borrar y recrear.
       *
       * Borrar primero haría que importar una copia vieja se llevara puesto lo
       * que se agregó después, que es exactamente lo que este importador
       * promete no hacer. Con llave —el par intervención+servicio, y el id de
       * la observación— importar dos veces deja lo mismo que importar una, y
       * nada de lo nuevo se pierde.
       */
      for (const servicio of inter.servicios) {
        const serviceTypeId = idPorSlug.get(servicio.slug)
        if (!serviceTypeId) {
          omitidos += 1
          continue
        }

        await prisma.interventionService.upsert({
          where: {
            interventionId_serviceTypeId: { interventionId: inter.id, serviceTypeId },
          },
          update: { detail: servicio.detail ?? null },
          create: { interventionId: inter.id, serviceTypeId, detail: servicio.detail ?? null },
        })
      }

      if (inter.medicion) {
        const m = inter.medicion
        const campos = {
          wellId: inter.wellId,
          measuredAt: new Date(`${m.measuredAt}T00:00:00Z`),
          depthM: m.depthM ?? null,
          pumpDepthM: m.pumpDepthM ?? null,
          dynamicLevelM: m.dynamicLevelM ?? null,
          staticLevelM: m.staticLevelM ?? null,
          boreDiameterIn: m.boreDiameterIn ?? null,
          flowRateM3H: m.flowRateM3H ?? null,
          // Una bomba que no está en el catálogo de esta base se deja en nulo:
          // perder qué bomba era es mucho menos grave que perder la medición.
          pumpId: m.bomba ? (idPorBomba.get(m.bomba) ?? null) : null,
        }

        await prisma.wellStatusReading.upsert({
          where: { interventionId: inter.id },
          update: campos,
          create: { ...campos, interventionId: inter.id, createdById: actor.id },
        })
      }

      for (const obs of inter.observaciones) {
        await prisma.observation.upsert({
          where: { id: obs.id },
          update: { body: obs.body },
          create: {
            id: obs.id,
            wellId: inter.wellId,
            interventionId: inter.id,
            body: obs.body,
            createdById: actor.id,
          },
        })
      }

      intervenciones += 1
    }
  }

  revalidatePath('/mapa')
  revalidatePath('/fincas')
  revalidatePath('/')

  return { ok: true, fincas: datos.fincas.length, pozos, dibujos, intervenciones, omitidos }
}
