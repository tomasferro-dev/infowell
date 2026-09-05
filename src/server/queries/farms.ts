import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { validarGeometria } from '@/lib/anotaciones'
import { inicialesDeFinca, numerarPozos } from '@/lib/etiquetas-mapa'
import { authorize } from '@/server/authz'
import { prisma } from '@/server/db'
import { criterioDeNumeracion } from '@/server/queries/ajustes'
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

  const [finca, criterio] = await Promise.all([
    prisma.farm.findFirst({
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
            createdAt: true,
            drilledAt: true,
            _count: { select: { interventions: { where: { deletedAt: null } } } },
          },
        },
        members: {
          select: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        _count: { select: { receipts: { where: { deletedAt: null } } } },
      },
    }),
    criterioDeNumeracion(),
  ])

  if (!finca) return null

  // El número que se ve en el mapa tiene que ser el mismo acá: si no
  // coincidiera, dejaría de servir para nombrar un pozo en voz alta.
  const numeros = numerarPozos(finca.wells, criterio)

  return {
    ...finca,
    wells: finca.wells.map((pozo) => ({ ...pozo, numero: numeros.get(pozo.id) ?? null })),
  }
}

/**
 * Qué número le toca a un pozo dentro de su finca.
 *
 * Se numeran todos los pozos de la finca y después se busca el que interesa:
 * numerar solo el pedido daría siempre 1.
 */
export async function numeroDelPozo(farmId: string, wellId: string) {
  await requireAccess('read', 'well', farmId)

  const [pozos, criterio] = await Promise.all([
    prisma.well.findMany({
      where: { farmId, deletedAt: null },
      select: { id: true, createdAt: true, drilledAt: true },
    }),
    criterioDeNumeracion(),
  ])

  return numerarPozos(pozos, criterio).get(wellId) ?? null
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
  const [scope, criterio, actor] = await Promise.all([
    scopeDeFincas(),
    criterioDeNumeracion(),
    requireActor(),
  ])

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
          // Para numerarlos: la fecha de carga siempre está, la de
          // perforación puede faltar.
          createdAt: true,
          drilledAt: true,
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

  /**
   * Los dibujos que este actor puede ver.
   *
   * Los que cuelgan de una finca salen del MISMO acotamiento que los
   * marcadores: un cliente no recibe los de otra finca.
   *
   * Los SUELTOS —los que no pertenecen a nada, como una referencia en la
   * ruta— son internos: los ven ADMIN y CARGADOR, nunca un CLIENTE. No es
   * pudor: al no colgar de ninguna finca quedan fuera de la cadena que
   * garantiza el aislamiento, y sus nombres podrían delatarle a un cliente
   * dónde están las fincas de otros.
   */
  const vePuntosSueltos = actor.role !== 'CLIENTE'

  const dibujos = await prisma.mapAnnotation.findMany({
    where: {
      deletedAt: null,
      OR: [
        { farm: { ...scope, deletedAt: null } },
        ...(vePuntosSueltos ? [{ farmId: null }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      farmId: true,
      wellId: true,
      kind: true,
      label: true,
      notes: true,
      color: true,
      filled: true,
      geometry: true,
      farm: { select: { name: true } },
      well: { select: { name: true } },
    },
  })

  /**
   * Lo que todavía no está en el mapa, con nombre y con adónde ir a marcarlo.
   *
   * Antes esto era un número suelto —«faltan ubicar 2»— y no servía para nada:
   * el usuario se enteraba del problema pero no de cuál era ni de cómo
   * arreglarlo. Un aviso que no se puede accionar es ruido.
   */
  const sinUbicar: {
    tipo: 'finca' | 'pozo'
    id: string
    nombre: string
    nombreFinca: string
    /** La ruta del formulario donde se le pone la ubicación. */
    donde: string
  }[] = []

  const marcadores = fincas.flatMap((finca) => {
    // Se numeran TODOS los pozos de la finca, incluidos los que no tienen
    // ubicación. Numerando solo los del mapa, el «2» del mapa podría ser el
    // tercero de la finca y el número dejaría de coincidir con la realidad.
    const numeros = numerarPozos(finca.wells, criterio)

    const pozos = finca.wells.flatMap((pozo) => {
      if (pozo.latitude === null || pozo.longitude === null) {
        sinUbicar.push({
          tipo: 'pozo',
          id: pozo.id,
          nombre: pozo.name,
          nombreFinca: finca.name,
          donde: `/fincas/${finca.id}/pozos/${pozo.id}/editar`,
        })
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
          etiqueta: String(numeros.get(pozo.id) ?? '?'),
          // El permiso sale de la finca, igual que para ella: en una finca
          // grande, «cómo se llega al cabezal» es del pozo y no de la finca.
          puedeDibujar: authorize(actor, 'write', 'farm', finca.id),
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
      sinUbicar.push({
        tipo: 'finca',
        id: finca.id,
        nombre: finca.name,
        nombreFinca: finca.name,
        donde: `/fincas/${finca.id}/editar`,
      })
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
        etiqueta: inicialesDeFinca(finca.name),
        // En la finca el número que importa es cuántos pozos tiene.
        intervenciones: finca.wells.length,
        // Se decide por finca y no por rol: si mañana un CARGADOR puede
        // escribir algunas fincas, esto ya funciona sin tocarlo.
        puedeDibujar: authorize(actor, 'write', 'farm', finca.id),
        lat: finca.latitude.toNumber(),
        lon: finca.longitude.toNumber(),
        ultimaVisita: null,
        estado: null,
      },
      ...pozos,
    ]
  })

  // La geometría se valida al leer, no solo al escribir: la columna es Json y
  // una fila vieja o tocada a mano no puede tumbar el mapa entero.
  const anotaciones = dibujos.flatMap((d) => {
    const geo = validarGeometria(d.kind, d.geometry)
    if (!geo.ok) return []

    return [
      {
        id: d.id,
        farmId: d.farmId,
        wellId: d.wellId,
        // A qué pertenece, para poder decirlo al abrirlo.
        pertenece: d.well?.name ?? d.farm?.name ?? 'Punto suelto',
        forma: d.kind,
        etiqueta: d.label,
        notas: d.notes,
        color: d.color,
        pintado: d.filled,
        puntos: geo.puntos,
        // Quién puede corregirlo o borrarlo. Se resuelve acá, con el mismo
        // núcleo de autorización que todo lo demás: la vista solo obedece.
        // Un dibujo suelto no tiene finca de la cual sacar el permiso: lo
        // tocan los mismos que lo ven, que ya excluye al cliente.
        puedeEditar: d.farmId
          ? authorize(actor, 'write', 'farm', d.farmId)
          : vePuntosSueltos,
      },
    ]
  })

  // Las fincas primero: ubicar la finca es lo que pone en el mapa a todos sus
  // pozos de una, así que es por donde conviene empezar.
  sinUbicar.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'finca' ? -1 : 1))

  return {
    marcadores,
    anotaciones,
    sinUbicar,
    // Si puede marcar referencias que no cuelgan de ninguna finca. Es interno:
    // el cliente ni las ve. Ver `authz.ts`.
    puedeMarcarSueltos: authorize(actor, 'write', 'annotation'),
    /*
     * Si puede calzar imágenes sobre el terreno.
     *
     * No se pregunta `authorize(actor, 'write', 'overlay')` a secas: `overlay`
     * es de finca, y sin finca la respuesta es NO a propósito — es la regla
     * que impide que un scope olvidado se cuele por omisión.
     *
     * Así que se pregunta sobre las fincas que el actor YA puede ver. Es solo
     * la pista para mostrar el botón; el permiso de verdad se vuelve a decidir
     * por finca en la acción y en la firma de subida.
     */
    puedeCalzarImagen: marcadores.some(
      (m) => m.tipo === 'finca' && authorize(actor, 'write', 'overlay', m.id),
    ),
  }
}

export type AnotacionMapa = Awaited<ReturnType<typeof puntosDelMapa>>['anotaciones'][number]

export type MarcadorMapa = Awaited<ReturnType<typeof puntosDelMapa>>['marcadores'][number]
