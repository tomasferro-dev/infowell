import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PozoForm } from '@/components/forms/pozo-form'
import { textoDeUrl, ubicacionDeUrl } from '@/lib/colocacion-mapa'
import { Button } from '@/components/ui/button'
import { crearPozoAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'

export default async function NuevoPozoPage({
  params,
  searchParams,
}: {
  params: Promise<{ farmId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ farmId }, query] = await Promise.all([params, searchParams])

  const { latitude, longitude, desdeMapa } = ubicacionDeUrl(query)

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
        pozo={{
          name: textoDeUrl(query.name) ?? '',
          code: textoDeUrl(query.code),
          latitude,
          longitude,
          drilledAt: textoDeUrl(query.drilledAt),
          notes: textoDeUrl(query.notes),
        }}
        origenUbicacion={desdeMapa ? 'mapa' : undefined}
        farmIdParaMapa={farmId}
      />
    </div>
  )
}
