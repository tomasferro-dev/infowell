import { ChevronLeft, Droplet, FileText, MapPin, Pencil, Phone, Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FlechaOCarga, IndicadorEnlace } from '@/components/layout/indicador-enlace'
import { desactivarFincaAction, reactivarFincaAction } from '@/server/actions/farms'
import { can } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'

export default async function FincaPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params

  const finca = await obtenerFinca(farmId)
  // 404 y no 403: para quien no tiene acceso, esta finca no existe.
  if (!finca) notFound()

  const [puedeEditar, puedeCrearPozo] = await Promise.all([
    can('write', 'farm', farmId),
    can('write', 'well', farmId),
  ])

  const ubicacion = [finca.address, finca.city, finca.province].filter(Boolean).join(', ')

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/fincas">
          <ChevronLeft className="size-4" />
          Fincas
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{finca.name}</h1>
            {/* Sin esto, apagar una finca no se ve en ningún lado y el usuario
                no sabe si el botón hizo algo. */}
            {!finca.isActive ? <Badge variant="secondary">Apagada</Badge> : null}
          </div>
          {finca.taxId ? (
            <p className="text-muted-foreground text-sm tabular-nums">CUIT {finca.taxId}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2">
          {/* Solo si está ubicada: mandar al mapa a alguien que no aparece en
              el mapa es mandarlo a una pantalla vacía. */}
          {finca.latitude && finca.longitude ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/mapa?punto=${farmId}`}>
                <MapPin className="size-4" />
                Mapa
              </Link>
            </Button>
          ) : null}

          {puedeEditar ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/fincas/${farmId}/editar`}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {ubicacion || finca.contactName || finca.contactPhone ? (
        <Card>
          <CardContent className="space-y-2 text-sm">
            {ubicacion ? (
              <p className="flex items-start gap-2">
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                {ubicacion}
              </p>
            ) : null}
            {finca.contactName || finca.contactPhone ? (
              <p className="flex items-start gap-2">
                <Phone className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                {[finca.contactName, finca.contactPhone].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Pozos</h2>
          {/* Apagada no se le carga trabajo nuevo: es todo el punto de
              apagarla. Los pozos que ya tiene se siguen viendo. */}
          {puedeCrearPozo && finca.isActive ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/fincas/${farmId}/pozos/nuevo`}>
                <Plus className="size-4" />
                Agregar
                <IndicadorEnlace />
              </Link>
            </Button>
          ) : null}
        </div>

        {finca.wells.length === 0 ? (
          <Card className="p-6 text-center">
            <Droplet className="text-muted-foreground mx-auto size-7" />
            <p className="mt-2 text-sm font-medium">Esta finca todavía no tiene pozos</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {finca.wells.map((pozo) => (
              <li key={pozo.id}>
                <Link
                  href={`/fincas/${farmId}/pozos/${pozo.id}`}
                  className="hover:bg-accent flex items-center gap-3 rounded-lg border p-4 transition-colors"
                >
                  {/* El mismo número que se ve en el mapa: es como se nombra
                      el pozo en voz alta, así que tiene que estar en los dos
                      lados o no sirve para nada. */}
                  {pozo.numero === null ? (
                    <Droplet className="text-primary size-5 shrink-0" />
                  ) : (
                    <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums">
                      {pozo.numero}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{pozo.name}</p>
                    {pozo.code ? (
                      <p className="text-muted-foreground truncate text-sm">{pozo.code}</p>
                    ) : null}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {pozo._count.interventions}{' '}
                    {pozo._count.interventions === 1 ? 'servicio' : 'servicios'}
                  </Badge>
                  <FlechaOCarga />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Link
          href={`/fincas/${farmId}/remitos`}
          className="hover:bg-accent flex items-center gap-3 rounded-lg border p-4 transition-colors"
        >
          <FileText className="text-primary size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Remitos</p>
            <p className="text-muted-foreground text-sm">
              {finca._count.receipts === 0
                ? 'Sin remitos cargados'
                : `${finca._count.receipts} cargado(s)`}
            </p>
          </div>
          <FlechaOCarga />
        </Link>
      </section>

      {/*
        Apagar NO es archivar. Apagada, la finca sigue en la lista y en el mapa
        con todo su historial; solo deja de ofrecerse para cargar remitos
        nuevos. Es para una finca que dejó de ser cliente: lo que se hizo hay
        que poder consultarlo, pero nadie debería cargarle trabajo nuevo.
      */}
      {puedeEditar ? (
        <form
          action={
            finca.isActive
              ? desactivarFincaAction.bind(null, farmId)
              : reactivarFincaAction.bind(null, farmId)
          }
          className="border-t pt-5"
        >
          <Button
            type="submit"
            variant={finca.isActive ? 'outline' : 'default'}
            className="h-12 w-full"
          >
            {finca.isActive ? 'Apagar esta finca' : 'Volver a activarla'}
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            {finca.isActive
              ? 'Sigue viéndose en la lista y en el mapa, con sus pozos y su historial. Deja de aparecer para cargar remitos nuevos.'
              : 'Vuelve a aparecer para cargar remitos.'}
          </p>
        </form>
      ) : null}
    </div>
  )
}
