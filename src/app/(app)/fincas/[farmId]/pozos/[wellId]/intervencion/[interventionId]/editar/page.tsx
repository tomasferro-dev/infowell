import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BorrarIntervencion } from '@/components/forms/borrar-intervencion'
import { IntervencionForm } from '@/components/forms/intervencion-form'
import { Button } from '@/components/ui/button'
import { archivarIntervencionAction, editarIntervencionAction } from '@/server/actions/interventions'
import { requireAccess } from '@/server/guards'
import { obtenerPozo } from '@/server/queries/farms'
import { listarBombasActivas, listarServiciosActivos } from '@/server/queries/catalog'
import { obtenerIntervencion } from '@/server/queries/interventions'

export default async function EditarIntervencionPage({
  params,
}: {
  params: Promise<{ farmId: string; wellId: string; interventionId: string }>
}) {
  const { farmId, wellId, interventionId } = await params

  await requireAccess('write', 'intervention', farmId)

  const [pozo, intervencion, servicios, bombas] = await Promise.all([
    obtenerPozo(farmId, wellId),
    obtenerIntervencion(farmId, wellId, interventionId),
    listarServiciosActivos(),
    listarBombasActivas(),
  ])

  if (!pozo || !intervencion) notFound()

  // Los tres ids se fijan en el servidor: no viajan como campos del form.
  const guardar = editarIntervencionAction.bind(null, farmId, wellId, interventionId)
  const borrar = archivarIntervencionAction.bind(null, farmId, wellId, interventionId)

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}/pozos/${wellId}`}>
          <ChevronLeft className="size-4" />
          {pozo.name}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar intervención</h1>
        <p className="text-muted-foreground text-sm">
          {pozo.farm.name} · {pozo.name}
        </p>
      </div>

      <IntervencionForm
        action={guardar}
        servicios={servicios.map((s) => ({
          id: s.id,
          label: s.label,
          slug: s.slug,
          icon: 'icon' in s ? (s.icon as string | null) : null,
        }))}
        bombas={bombas.map((b) => ({ id: b.id, label: b.label, slug: b.slug }))}
        fechaPorDefecto={intervencion.performedAt}
        farmId={farmId}
        wellId={wellId}
        previa={intervencion}
        textoBoton="Guardar cambios"
      />

      <div className="border-t pt-6">
        <BorrarIntervencion action={borrar} />
      </div>
    </div>
  )
}
