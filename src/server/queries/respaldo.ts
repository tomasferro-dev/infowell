import 'server-only'

import { nombreDeArchivo, VERSION_RESPALDO, type Respaldo } from '@/lib/respaldo'
import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/**
 * Arma el respaldo con TODO lo que hay, sin acotar por finca.
 *
 * Es lo contrario a las demás consultas de este proyecto, y por eso exige
 * permiso de administrador: un respaldo parcial no sirve para restaurar nada,
 * y darle a un cliente los datos de todas las fincas sería la fuga más grande
 * posible de una sola vez.
 */
export async function armarRespaldo(): Promise<{ datos: Respaldo; archivo: string }> {
  await requireAccess('write', 'setting')

  const [fincas, dibujos, intervenciones] = await Promise.all([
    prisma.farm.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        taxId: true,
        address: true,
        city: true,
        province: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        notes: true,
        latitude: true,
        longitude: true,
        isActive: true,
        wells: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            code: true,
            latitude: true,
            longitude: true,
            drilledAt: true,
            notes: true,
            isActive: true,
          },
        },
      },
    }),

    prisma.mapAnnotation.findMany({
      where: { deletedAt: null },
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
      },
    }),

    /*
     * El historial.
     *
     * Los servicios salen por SLUG y la bomba por su etiqueta normalizada, no
     * por id: los cuid son distintos en cada base y un respaldo con ids no se
     * podría importar en otra, que es la mitad del propósito de esto.
     *
     * Las observaciones van solo si tienen texto. Una que era solo nota de voz
     * no se exporta: el audio no entra en un JSON, e importarla vacía violaría
     * la regla del modelo, que exige texto o audio.
     */
    prisma.intervention.findMany({
      where: { deletedAt: null, well: { deletedAt: null } },
      orderBy: { performedAt: 'asc' },
      select: {
        id: true,
        wellId: true,
        performedAt: true,
        services: { select: { detail: true, serviceType: { select: { slug: true } } } },
        reading: {
          select: {
            measuredAt: true,
            depthM: true,
            pumpDepthM: true,
            dynamicLevelM: true,
            staticLevelM: true,
            boreDiameterIn: true,
            flowRateM3H: true,
            pump: { select: { normalizedLabel: true } },
          },
        },
        observations: {
          where: { deletedAt: null, body: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, body: true },
        },
      },
    }),
  ])

  return {
    archivo: nombreDeArchivo(),
    datos: {
      version: VERSION_RESPALDO,
      exportadoEl: new Date().toISOString(),
      // Los Decimal y las Date no son JSON: se pasan a texto acá, en el mismo
      // formato en que el importador los espera.
      fincas: fincas.map((f) => ({
        ...f,
        latitude: f.latitude?.toString() ?? null,
        longitude: f.longitude?.toString() ?? null,
        pozos: f.wells.map((p) => ({
          ...p,
          latitude: p.latitude?.toString() ?? null,
          longitude: p.longitude?.toString() ?? null,
          drilledAt: p.drilledAt?.toISOString().slice(0, 10) ?? null,
        })),
      })),
      dibujos,
      intervenciones: intervenciones.map((i) => ({
        id: i.id,
        wellId: i.wellId,
        performedAt: i.performedAt.toISOString().slice(0, 10),
        servicios: i.services.map((s) => ({
          slug: s.serviceType.slug,
          detail: s.detail,
        })),
        medicion: i.reading
          ? {
              measuredAt: i.reading.measuredAt.toISOString().slice(0, 10),
              depthM: i.reading.depthM?.toString() ?? null,
              pumpDepthM: i.reading.pumpDepthM?.toString() ?? null,
              dynamicLevelM: i.reading.dynamicLevelM?.toString() ?? null,
              staticLevelM: i.reading.staticLevelM?.toString() ?? null,
              boreDiameterIn: i.reading.boreDiameterIn?.toString() ?? null,
              flowRateM3H: i.reading.flowRateM3H?.toString() ?? null,
              bomba: i.reading.pump?.normalizedLabel ?? null,
            }
          : null,
        // El filtro de arriba ya sacó las sin texto; el `?? ''` es solo para
        // que TypeScript sepa que acá no puede haber null.
        observaciones: i.observations.map((o) => ({ id: o.id, body: o.body ?? '' })),
      })),
    },
  }
}
