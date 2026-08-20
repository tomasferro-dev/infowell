import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FincaForm } from '@/components/forms/finca-form'
import { Button } from '@/components/ui/button'
import { editarFincaAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'

export default async function EditarFincaPage({
  params,
}: {
  params: Promise<{ farmId: string }>
}) {
  const { farmId } = await params

  await requireAccess('write', 'farm', farmId)

  const finca = await obtenerFinca(farmId)
  if (!finca) notFound()

  // bind fija el farmId del lado del servidor: no viaja como campo del form,
  // así que el cliente no puede cambiarlo por el de otra finca.
  const action = editarFincaAction.bind(null, farmId)

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}`}>
          <ChevronLeft className="size-4" />
          {finca.name}
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Editar finca</h1>

      <FincaForm
        action={action}
        finca={{
          ...finca,
          // Decimal no es serializable hacia un Client Component.
          latitude: finca.latitude?.toString() ?? null,
          longitude: finca.longitude?.toString() ?? null,
        }}
      />
    </div>
  )
}
