import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PozoForm } from '@/components/forms/pozo-form'
import { Button } from '@/components/ui/button'
import { crearPozoAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'

export default async function NuevoPozoPage({
  params,
}: {
  params: Promise<{ farmId: string }>
}) {
  const { farmId } = await params

  await requireAccess('write', 'well', farmId)

  const finca = await obtenerFinca(farmId)
  if (!finca) notFound()

  const action = crearPozoAction.bind(null, farmId)

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}`}>
          <ChevronLeft className="size-4" />
          {finca.name}
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Nuevo pozo</h1>

      <PozoForm action={action} textoBoton="Crear pozo" />
    </div>
  )
}
