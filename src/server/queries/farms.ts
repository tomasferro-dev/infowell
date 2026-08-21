import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { requireAccess, requireActor } from '@/server/guards'

/**
 * Lecturas de fincas y pozos.
 *
 * REGLA INVIOLABLE: ninguna función de este archivo consulta sin acotar por
 * finca. El acotamiento sale del Actor, nunca de un parámetro que venga del
 * navegador.
 */

/** Fragmento de `where` que limita al alcance del actor. */
async function scopeDeFincas() {
  const actor = await requireActor()

  // ADMIN ve todo; el resto, solo sus membresías. Con farmIds vacío, el
  // `in: []` no matchea nada — que es exactamente lo correcto.
  return actor.role === 'ADMIN' ? {} : { id: { in: actor.farmIds } }
}

export async function listarFincas(busqueda?: string) {
  const scope = await scopeDeFincas()

  return prisma.farm.findMany({
    where: {
      ...scope,
      deletedAt: null,
      ...(busqueda
        ? {
            OR: [
              { name: { contains: busqueda, mode: 'insensitive' as const } },
              { city: { contains: busqueda, mode: 'insensitive' as const } },
              { contactName: { contains: busqueda, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      city: true,
      province: true,
      contactName: true,
      isActive: true,
      _count: { select: { wells: { where: { deletedAt: null } } } },
    },
  })
}

/**
 * Devuelve la finca solo si el actor tiene acceso. `null` en cualquier otro
 * caso — la página lo traduce a 404, sin distinguir "no existe" de "no es tuya".
 */
export async function obtenerFinca(farmId: string) {
  await requireAccess('read', 'farm', farmId)

  return prisma.farm.findFirst({
    where: { id: farmId, deletedAt: null },
    include: {
      wells: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          _count: { select: { interventions: { where: { deletedAt: null } } } },
        },
      },
      members: {
        select: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
      _count: { select: { receipts: { where: { deletedAt: null } } } },
    },
  })
}

export async function obtenerPozo(farmId: string, wellId: string) {
  await requireAccess('read', 'well', farmId)

  // El farmId va en el where, no solo en el guard: aunque alguien pase el
  // wellId de otra finca, la consulta no lo encuentra.
  return prisma.well.findFirst({
    where: { id: wellId, farmId, deletedAt: null },
    include: {
      farm: { select: { id: true, name: true } },
      _count: {
        select: {
          interventions: { where: { deletedAt: null } },
          observations: { where: { deletedAt: null } },
        },
      },
    },
  })
}

/** Fincas donde el actor puede cargar remitos. Alimenta selectores del alta. */
export async function fincasParaSelector() {
  const scope = await scopeDeFincas()

  return prisma.farm.findMany({
    where: { ...scope, deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}

/**
 * Todo lo que tiene coordenadas y el actor puede ver, para dibujar el mapa.
 *
 * Los Decimal se pasan a número acá: el mapa es un componente de cliente y
 * Decimal no cruza esa frontera. Se pierde precisión a partir del dígito 15,
 * y la columna guarda 7 decimales — un centímetro. No hay riesgo.
 *
 * Los que todavía no fueron marcados con GPS quedan afuera de la respuesta,
 * pero se cuentan: el mapa avisa cuántos faltan en vez de mentir por omisión.
 */
export async function puntosDelMapa() {
  const scope = await scopeDeFincas()

  const fincas = await prisma.farm.findMany({
    where: { ...scope, deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      city: true,
      latitude: true,
      longitude: true,
      wells: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          latitude: true,
          longitude: true,
          _count: { select: { interventions: { where: { deletedAt: null } } } },
          // La última medición y la última visita: es lo que se quiere saber
          // al tocar un pozo estando parado en la finca.
          readings: {
            where: { deletedAt: null },
            orderBy: { measuredAt: 'desc' },
            take: 1,
            select: {
              measuredAt: true,
              depthM: true,
              staticLevelM: true,
              dynamicLevelM: true,
              flowRateM3H: true,
              pump: { select: { label: true } },
            },
          },
          interventions: {
            where: { deletedAt: null },
            orderBy: { performedAt: 'desc' },
            take: 1,
            select: { performedAt: true },
          },
        },
      },
    },
  })

  let pozosSinUbicar = 0
  let fincasSinUbicar = 0

  const marcadores = fincas.flatMap((finca) => {
    const pozos = finca.wells.flatMap((pozo) => {
      if (pozo.latitude === null || pozo.longitude === null) {
        pozosSinUbicar += 1
        return []
      }
      const lectura = pozo.readings[0]
      const num = (v: Prisma.Decimal | null) => (v === null ? null : v.toNumber())

      return [
        {
          tipo: 'pozo' as const,
          id: pozo.id,
          farmId: finca.id,
          nombre: pozo.name,
          detalle: pozo.code,
          nombreFinca: finca.name,
          intervenciones: pozo._count.interventions,
          lat: pozo.latitude.toNumber(),
          lon: pozo.longitude.toNumber(),
          ultimaVisita: pozo.interventions[0]?.performedAt.toISOString().slice(0, 10) ?? null,
          estado: lectura
            ? {
                medidoEl: lectura.measuredAt.toISOString().slice(0, 10),
                profundidadM: num(lectura.depthM),
                nivelEstaticoM: num(lectura.staticLevelM),
                nivelDinamicoM: num(lectura.dynamicLevelM),
                caudalM3H: num(lectura.flowRateM3H),
                bomba: lectura.pump?.label ?? null,
              }
            : null,
        },
      ]
    })

    if (finca.latitude === null || finca.longitude === null) {
      fincasSinUbicar += 1
      return pozos
    }

    return [
      {
        tipo: 'finca' as const,
        id: finca.id,
        farmId: finca.id,
        nombre: finca.name,
        detalle: finca.city,
        nombreFinca: finca.name,
        // En la finca el número que importa es cuántos pozos tiene.
        intervenciones: finca.wells.length,
        lat: finca.latitude.toNumber(),
        lon: finca.longitude.toNumber(),
        ultimaVisita: null,
        estado: null,
      },
      ...pozos,
    ]
  })

  return { marcadores, pozosSinUbicar, fincasSinUbicar }
}

export type MarcadorMapa = Awaited<ReturnType<typeof puntosDelMapa>>['marcadores'][number]
