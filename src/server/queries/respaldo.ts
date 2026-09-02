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

  const [fincas, dibujos] = await Promise.all([
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
    },
  }
}
