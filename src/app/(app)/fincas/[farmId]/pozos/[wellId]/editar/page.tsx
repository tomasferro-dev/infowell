import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PozoForm } from '@/components/forms/pozo-form'
import { Button } from '@/components/ui/button'
import { editarPozoAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerPozo } from '@/server/queries/farms'

export default async function EditarPozoPage({
  params,
}: {
  params: Promise<{ farmId: string; wellId: string }>
}) {
  const { farmId, wellId } = await params

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
          name: pozo.name,
          code: pozo.code,
          // Decimal y Date no cruzan al cliente: se serializan acá.
          latitude: pozo.latitude?.toString() ?? null,
          longitude: pozo.longitude?.toString() ?? null,
          drilledAt: pozo.drilledAt?.toISOString().slice(0, 10) ?? null,
          notes: pozo.notes,
        }}
      />
    </div>
  )
}
