import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { RemitoForm } from '@/components/forms/remito-form'
import { Button } from '@/components/ui/button'
import { crearRemitoAction } from '@/server/actions/receipts'
import { requireAccess } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'

export default async function NuevoRemitoPage({
  params,
}: {
  params: Promise<{ farmId: string }>
}) {
  const { farmId } = await params

  await requireAccess('write', 'receipt', farmId)

  const finca = await obtenerFinca(farmId)
  if (!finca) notFound()

  const action = crearRemitoAction.bind(null, farmId)

  // Fecha local, no UTC: después de las 21 h en Argentina, toISOString ya
  // devuelve el día siguiente.
  const hoy = new Date()
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}/remitos`}>
          <ChevronLeft className="size-4" />
          Remitos
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cargar remito</h1>
        <p className="text-muted-foreground text-sm">{finca.name}</p>
      </div>

      <RemitoForm action={action} farmId={farmId} fechaPorDefecto={fechaHoy} />
    </div>
  )
}
