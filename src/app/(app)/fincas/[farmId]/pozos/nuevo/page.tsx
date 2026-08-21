import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PozoForm } from '@/components/forms/pozo-form'
import { Button } from '@/components/ui/button'
import { crearPozoAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'

/**
 * Una coordenada que llegó por la URL.
 *
 * Viene del mapa, pero la URL la escribe cualquiera: si no es un número dentro
 * del rango se descarta en silencio y el formulario abre vacío. Mostrar un
 * error no tendría sentido — el usuario no escribió eso.
 */
function coordenada(valor: string | string[] | undefined, tope: number) {
  if (typeof valor !== 'string') return null

  const n = Number(valor)
  if (!Number.isFinite(n) || Math.abs(n) > tope) return null

  return n.toFixed(7)
}

export default async function NuevoPozoPage({
  params,
  searchParams,
}: {
  params: Promise<{ farmId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ farmId }, query] = await Promise.all([params, searchParams])

  const latitude = coordenada(query.lat, 90)
  const longitude = coordenada(query.lon, 180)
  // Una sola coordenada no ubica nada: o vienen las dos o no viene ninguna.
  const desdeMapa = latitude !== null && longitude !== null

  await requireAccess('write', 'well', farmId)

  const finca = await obtenerFinca(farmId)
  if (!finca) notFound()

  const action = crearPozoAction.bind(null, farmId, desdeMapa)

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}`}>
          <ChevronLeft className="size-4" />
          {finca.name}
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Nuevo pozo</h1>

      <PozoForm
        action={action}
        textoBoton="Crear pozo"
        pozo={
          desdeMapa
            ? {
                name: '',
                code: null,
                latitude,
                longitude,
                drilledAt: null,
                notes: null,
              }
            : undefined
        }
        origenUbicacion={desdeMapa ? 'mapa' : undefined}
      />
    </div>
  )
}
