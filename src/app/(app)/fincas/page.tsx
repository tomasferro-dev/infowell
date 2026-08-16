import { Building2, Plus, Search } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FlechaOCarga, IndicadorEnlace } from '@/components/layout/indicador-enlace'
import { listarFincas } from '@/server/queries/farms'
import { can } from '@/server/guards'

export default async function FincasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams

  const [fincas, puedeCrear] = await Promise.all([listarFincas(q), can('write', 'user')])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Fincas</h1>
        {puedeCrear ? (
          <Button asChild size="sm">
            <Link href="/fincas/nueva">
              <Plus className="size-4" />
              Nueva
              <IndicadorEnlace />
            </Link>
          </Button>
        ) : null}
      </div>

      {/* GET simple: la búsqueda queda en la URL y se puede compartir. */}
      <form className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, localidad o contacto"
          className="h-12 pl-9 text-base"
          aria-label="Buscar fincas"
        />
      </form>

      {fincas.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-medium">
            {q ? 'Ninguna finca coincide con la búsqueda' : 'Todavía no hay fincas'}
          </p>
          {!q && puedeCrear ? (
            <Button asChild className="mt-4">
              <Link href="/fincas/nueva">Crear la primera</Link>
            </Button>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-2">
          {fincas.map((finca) => (
            <li key={finca.id}>
              <Link
                href={`/fincas/${finca.id}`}
                className="hover:bg-accent flex items-center gap-3 rounded-lg border p-4 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{finca.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {[finca.city, finca.province].filter(Boolean).join(', ') || 'Sin ubicación'}
                  </p>
                </div>

                <Badge variant="secondary" className="shrink-0">
                  {finca._count.wells} {finca._count.wells === 1 ? 'pozo' : 'pozos'}
                </Badge>
                <FlechaOCarga />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
