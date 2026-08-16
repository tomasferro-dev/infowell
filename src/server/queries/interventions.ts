import 'server-only'

import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/**
 * Lecturas del historial de un pozo.
 *
 * Todo lo que sale de acá cruza hacia Client Components, así que los Decimal y
 * las Date de Prisma se serializan ANTES de devolverlos: los Decimal no son
 * serializables y explotan en el borde servidor/cliente.
 */

export type MedicionSerializada = {
  depthM: number | null
  pumpDepthM: number | null
  dynamicLevelM: number | null
  staticLevelM: number | null
  boreDiameterIn: number | null
  flowRateM3H: number | null
  pump: { id: string; label: string } | null
}

function serializarMedicion(lectura: {
  depthM: unknown
  pumpDepthM: unknown
  dynamicLevelM: unknown
  staticLevelM: unknown
  boreDiameterIn: unknown
  flowRateM3H: unknown
  pump: { id: string; label: string } | null
}): MedicionSerializada {
  const num = (v: unknown) => (v == null ? null : Number(v))

  return {
    depthM: num(lectura.depthM),
    pumpDepthM: num(lectura.pumpDepthM),
    dynamicLevelM: num(lectura.dynamicLevelM),
    staticLevelM: num(lectura.staticLevelM),
    boreDiameterIn: num(lectura.boreDiameterIn),
    flowRateM3H: num(lectura.flowRateM3H),
    pump: lectura.pump,
  }
}

/** Timeline completo del pozo: la historia contada en orden inverso. */
export async function historialDelPozo(farmId: string, wellId: string) {
  await requireAccess('read', 'intervention', farmId)

  const intervenciones = await prisma.intervention.findMany({
    where: { wellId, deletedAt: null, well: { farmId } },
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      performedAt: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
      services: {
        select: { serviceType: { select: { id: true, name: true, icon: true } } },
      },
      reading: {
        select: {
          depthM: true,
          pumpDepthM: true,
          dynamicLevelM: true,
          staticLevelM: true,
          boreDiameterIn: true,
          flowRateM3H: true,
          pump: { select: { id: true, label: true } },
        },
      },
      observations: {
        where: { deletedAt: null },
        select: {
          id: true,
          body: true,
          voiceNotes: {
            select: { id: true, storagePath: true, durationSec: true, transcript: true },
          },
        },
      },
    },
  })

  return intervenciones.map((i) => ({
    id: i.id,
    performedAt: i.performedAt.toISOString(),
    autor: i.createdBy.name ?? i.createdBy.email,
    servicios: i.services.map((s) => s.serviceType),
    medicion: i.reading ? serializarMedicion(i.reading) : null,
    observaciones: i.observations,
  }))
}

/** Última medición conocida del pozo: es el "estado actual". */
export async function estadoActualDelPozo(farmId: string, wellId: string) {
  await requireAccess('read', 'reading', farmId)

  const lectura = await prisma.wellStatusReading.findFirst({
    where: { wellId, deletedAt: null, well: { farmId } },
    orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      measuredAt: true,
      depthM: true,
      pumpDepthM: true,
      dynamicLevelM: true,
      staticLevelM: true,
      boreDiameterIn: true,
      flowRateM3H: true,
      pump: { select: { id: true, label: true } },
    },
  })

  if (!lectura) return null

  return {
    measuredAt: lectura.measuredAt.toISOString(),
    ...serializarMedicion(lectura),
  }
}

/** Serie histórica de niveles y caudal, en orden cronológico para el gráfico. */
export async function seriesDeMediciones(farmId: string, wellId: string) {
  await requireAccess('read', 'reading', farmId)

  const lecturas = await prisma.wellStatusReading.findMany({
    where: { wellId, deletedAt: null, well: { farmId } },
    orderBy: { measuredAt: 'asc' },
    select: {
      measuredAt: true,
      staticLevelM: true,
      dynamicLevelM: true,
      flowRateM3H: true,
    },
  })

  return lecturas.map((l) => ({
    fecha: l.measuredAt.toISOString(),
    estatico: l.staticLevelM == null ? null : Number(l.staticLevelM),
    dinamico: l.dynamicLevelM == null ? null : Number(l.dynamicLevelM),
    caudal: l.flowRateM3H == null ? null : Number(l.flowRateM3H),
  }))
}
