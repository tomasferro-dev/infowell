import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PozoForm } from '@/components/forms/pozo-form'
import { Button } from '@/components/ui/button'
import { editarPozoAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'
import { obtenerPozo } from '@/server/queries/farms'

/**
 * Una coordenada que llegó por la URL, al volver de marcar el punto en el mapa.
 * Si no es un número en rango se ignora y queda la que ya tenía el pozo.
 */
function coordenada(valor: string | string[] | undefined, tope: number) {
  if (typeof valor !== 'string') return null

  const n = Number(valor)
  if (!Number.isFinite(n) || Math.abs(n) > tope) return null

  return n.toFixed(7)
}

export default async function EditarPozoPage({
  params,
  searchParams,
}: {
  params: Promise<{ farmId: string; wellId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ farmId, wellId }, query] = await Promise.all([params, searchParams])

  const latDelMapa = coordenada(query.lat, 90)
  const lonDelMapa = coordenada(query.lon, 180)
  const desdeMapa = latDelMapa !== null && lonDelMapa !== null

  /** Lo que estaba escrito antes de irse al mapa; si no vino, lo del pozo. */
  const texto = (valor: string | string[] | undefined) =>
    typeof valor === 'string' && valor !== '' ? valor : null

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
          name: texto(query.name) ?? pozo.name,
          code: texto(query.code) ?? pozo.code,
          // Decimal y Date no cruzan al cliente: se serializan acá. Lo que
          // volvió del mapa pisa lo guardado — es lo que el usuario acaba de
          // marcar, y todavía no se guardó nada.
          latitude: latDelMapa ?? pozo.latitude?.toString() ?? null,
          longitude: lonDelMapa ?? pozo.longitude?.toString() ?? null,
          drilledAt: texto(query.drilledAt) ?? pozo.drilledAt?.toISOString().slice(0, 10) ?? null,
          notes: texto(query.notes) ?? pozo.notes,
        }}
        origenUbicacion={desdeMapa ? 'mapa' : undefined}
        farmIdParaMapa={farmId}
        wellIdParaMapa={wellId}
      />
    </div>
  )
}
