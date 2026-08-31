import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PozoForm } from '@/components/forms/pozo-form'
import { textoDeUrl, ubicacionDeUrl } from '@/lib/colocacion-mapa'
import { Button } from '@/components/ui/button'
import { editarPozoAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerPozo } from '@/server/queries/farms'

export default async function EditarPozoPage({
  params,
  searchParams,
}: {
  params: Promise<{ farmId: string; wellId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ farmId, wellId }, query] = await Promise.all([params, searchParams])

  const {
    latitude: latDelMapa,
    longitude: lonDelMapa,
    desdeMapa,
  } = ubicacionDeUrl(query)

  await requireAccess('write', 'well', farmId)

  const pozo = await obtenerPozo(farmId, wellId)
  if (!pozo) notFound()

  const action = editarPozoAction.bind(null, farmId, wellId)

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}/pozos/${wellId}`}>
          <ChevronLeft className="size-4" />
          {pozo.name}
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Editar pozo</h1>

      <PozoForm
        action={action}
        pozo={{
          name: textoDeUrl(query.name) ?? pozo.name,
          code: textoDeUrl(query.code) ?? pozo.code,
          // Decimal y Date no cruzan al cliente: se serializan acá. Lo que
          // volvió del mapa pisa lo guardado — es lo que el usuario acaba de
          // marcar, y todavía no se guardó nada.
          latitude: latDelMapa ?? pozo.latitude?.toString() ?? null,
          longitude: lonDelMapa ?? pozo.longitude?.toString() ?? null,
          drilledAt: textoDeUrl(query.drilledAt) ?? pozo.drilledAt?.toISOString().slice(0, 10) ?? null,
          notes: textoDeUrl(query.notes) ?? pozo.notes,
        }}
        origenUbicacion={desdeMapa ? 'mapa' : undefined}
        farmIdParaMapa={farmId}
        wellIdParaMapa={wellId}
      />
    </div>
  )
}
