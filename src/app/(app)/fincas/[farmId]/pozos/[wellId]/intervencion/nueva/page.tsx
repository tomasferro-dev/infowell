import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { IntervencionForm } from '@/components/forms/intervencion-form'
import { Button } from '@/components/ui/button'
import { crearIntervencionAction } from '@/server/actions/interventions'
import { requireAccess } from '@/server/guards'
import { listarBombasActivas, listarServiciosActivos } from '@/server/queries/catalog'
import { obtenerPozo } from '@/server/queries/farms'

export default async function NuevaIntervencionPage({
  params,
}: {
  params: Promise<{ farmId: string; wellId: string }>
}) {
  const { farmId, wellId } = await params

  await requireAccess('write', 'intervention', farmId)

  const [pozo, servicios, bombas] = await Promise.all([
    obtenerPozo(farmId, wellId),
    listarServiciosActivos(),
    listarBombasActivas(),
  ])

  if (!pozo) notFound()

  // farmId y wellId se fijan en el servidor: no viajan como campos del form.
  const action = crearIntervencionAction.bind(null, farmId, wellId)

  // Fecha local, no UTC: toISOString() en Argentina devuelve el día siguiente
  // después de las 21 h, y el técnico vería mañana como fecha por defecto.
  const hoy = new Date()
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}/pozos/${wellId}`}>
          <ChevronLeft className="size-4" />
          {pozo.name}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva intervención</h1>
        <p className="text-muted-foreground text-sm">
          {pozo.farm.name} · {pozo.name}
        </p>
      </div>

      <IntervencionForm
        action={action}
        servicios={servicios.map((s) => ({
          id: s.id,
          label: s.label,
          slug: s.slug,
          icon: 'icon' in s ? (s.icon as string | null) : null,
        }))}
        bombas={bombas.map((b) => ({ id: b.id, label: b.label, slug: b.slug }))}
        fechaPorDefecto={fechaHoy}
        farmId={farmId}
        wellId={wellId}
      />
    </div>
  )
}
